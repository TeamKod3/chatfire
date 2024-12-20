/* eslint-disable no-unsafe-optional-chaining */
const QRCode = require('qrcode')
const pino = require('pino')
const {
    default: makeWASocket,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys')
const { unlinkSync, writeFileSync } = require('fs')
const { v4: uuidv4 } = require('uuid')
const path = require('node:path')
const processButton = require('../helper/processbtn')
const generateVC = require('../helper/genVc')
const Chat = require('../models/chat.model')
const axios = require('axios')
const config = require('../../config/config')
const downloadMessage = require('../helper/downloadMsg')
const logger = require('pino')()
const useMongoDBAuthState = require('../helper/mongoAuthState')
const fs = require('node:fs')
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const mime = require('mime-types')


const saveStats = require('../helper/saveStats');
const {sendDataToSupabase, adicionaRegistro, uploadSUp, fetchAllDataFromTable, deleteDataFromtable, updateDataInTable, getIdConexoes, getSingleConversa, getSingleWebhook, getIdWebHookMessage, getContato, fetchSetores, getConexao, getSingleBot, getConexaoById, getContatoById, getSingleConversaByConexao, getWebhookMessage, getContatoIsConexao} = require('../helper/sendSupabase');
const { formatarNumeroRelatorio } = require('../helper/formatarNumeroRelatorio')

class WhatsAppInstance {
    socketConfig = {
        // version: [2, 2413, 1],
        defaultQueryTimeoutMs: undefined,
        printQRInTerminal: false,
        logger: pino({
            level: 'silent', //debug
        }),
    }
    key = ''
    name = null
    authState
    allowWebhook = undefined
    webhook = undefined
    clientId = null
    empresaId = null
    duplicado = false
    contadorDeReconexao = 0

    instance = {
        conexaoId: '',
        key: this.key,
        chats: [],
        qr: '',
        messages: [],
        qrRetry: 0,
        customWebhook: '',
    }

    axiosInstance = axios.create({
        baseURL: config.webhookUrl,
    })

    constructor(key, allowWebhook, webhook, clientId, empresaId) {
        this.key = key ? key : uuidv4()
        this.instance.customWebhook = this.webhook ? this.webhook : webhook
        this.empresaId = empresaId
        this.allowWebhook = config.webhookEnabled
            ? config.webhookEnabled
            : allowWebhook
        if (this.allowWebhook && this.instance.customWebhook !== null) {
            this.allowWebhook = true
            this.instance.customWebhook = webhook
            this.axiosInstance = axios.create({
                baseURL: webhook,
            })
        }
        if(clientId){
            this.clientId = clientId
        } else {
            getIdConexoes('conexoes', this.key).then((result) => {
                if(result){
                    this.clientId = result.id
                    this.empresaId = result.id_empresa
                    this.name = result.Nome
                } else {
                    delete WhatsAppInstances[this.key]
                }
            })
        }
        
        
    }
    async downloadMessageSup(sock, msg, extension, id) {
        // download the message
        const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
                logger,
                // pass this so that baileys can request a reupload of media
                // that has been deleted
                reuploadRequest: sock?.updateMediaMessage
            }
        )
        // save to file
        const fileName = `${id ? id : msg.key.id}.${extension}`;
        const path = `${process.cwd()}/temp/${fileName}`;
    
        try {
            writeFileSync(path, buffer); // Usa writeFileSync
            await uploadSUp(path, fileName); // Chama a função corrigida de upload
        } catch (err) {
            console.error(err);
        }
    }
    async SendWebhook(type, body, key) {
        if (!this.allowWebhook) return
        this.axiosInstance
            .post('', {
                type,
                body,
                instanceKey: key,
            })
            .catch(() => {})
    }

    async init() {
        this.collection = mongoClient.db('whatsapp-api').collection(this.key)
        const { state, saveCreds } = await useMongoDBAuthState(this.collection)
        this.authState = { state: state, saveCreds: saveCreds }
        this.socketConfig.auth = this.authState.state
        this.socketConfig.browser = Object.values(config.browser)
        this.instance.sock = makeWASocket(this.socketConfig)
        this.instance.conexaoId = this.clientId
        
        this.setHandler()
        return this
    }

    setHandler() {
        const sock = this.instance.sock
        // on credentials update save state
        sock?.ev.on('creds.update', this.authState.saveCreds)

        // on socket closed, opened, connecting
        sock?.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update
            if (connection === 'close') {
                // reconnect if not logged out
                if (
                    lastDisconnect?.error?.output?.statusCode !==
                    DisconnectReason.loggedOut
                ) {
                    await this.init()
                } else {
                    await this.collection.drop().then((r) => {
                        logger.info('STATE: Droped collection')
                    })
                    this.instance.online = false
                    if(this.instance.conexaoId && !this.duplicado){
                        await updateDataInTable('conexoes', {id: this.clientId}, {status_conexao: 'desconectado', qrcode: '', Status: false})
                        await deleteDataFromtable('setor_conexao', {id_conexao: this.clientId})
                    }
                }
            } else if (connection === 'open') {
                if(this.instance.conexaoId){
                    setTimeout(async () => {
                        this.updateIntanceInfo()
                    }, 2000);
                }

                if (config.mongoose.enabled) {
                    let alreadyThere = await Chat.findOne({
                        key: this.key,
                    }).exec()
                    if (!alreadyThere) {
                        const saveChat = new Chat({ key: this.key })
                        await saveChat.save()
                        
                    }
                }
                this.instance.online = true
            }
            if (qr) {
                
                QRCode.toDataURL(qr).then((url) => {
                    this.instance.qr = url
                    this.instance.qrRetry++
                    if(this.clientId){
                        updateDataInTable('conexoes', {id: this.clientId}, {status_conexao: 'qrCode', qrcode: url})
                    }
                })
            }
        })

        // sending presence
        sock?.ev.on('presence.update', async (json) => {

            if (
                ['all', 'presence', 'presence.update'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook('presence', json, this.key)
        })

        // on receive all chats
        sock?.ev.on('chats.set', async ({ chats }) => {

            this.instance.chats = []
            const recivedChats = chats.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                }
            })
            this.instance.chats.push(...recivedChats)
            await this.updateDb(this.instance.chats)
            await this.updateDbGroupsParticipants()
        })

        // on recive new chat
        sock?.ev.on('chats.upsert', (newChat) => {

            const chats = newChat.map((chat) => {
                return {
                    ...chat,
                    messages: [],
                }
            })
            this.instance.chats.push(...chats)
        })

        // on chat change
        sock?.ev.on('chats.update', (changedChat) => {
            changedChat.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (pc) => pc.id === chat.id
                )
                const PrevChat = this.instance.chats[index]
                this.instance.chats[index] = {
                    ...PrevChat,
                    ...chat,
                }
            })
        })

        // on chat delete
        sock?.ev.on('chats.delete', (deletedChats) => {
            deletedChats.map((chat) => {
                const index = this.instance.chats.findIndex(
                    (c) => c.id === chat
                )
                this.instance.chats.splice(index, 1)
            })
        })

        // on new mssage
        sock?.ev.on('messages.upsert', async (m) => {
            if (m.type === 'prepend'){
                //Sei la
            }

            this.instance.messages.unshift(...m.messages)
            
            if (m.type !== 'notify') {
                return
            }
            if(m.messages.length > 1) {
                this.tratarMensagens(m.messages[0], sock, false, m)
                for(let i = 0; i < m.messages.length; i++) {
                    if(i === 0) continue
                    await new Promise((resolve) => {
                        setTimeout(() => {
                            this.tratarMensagens(m.messages[i], sock, true, m)
                            resolve()
                        }, 1500);
                    })
                }
                return
            }

            for(const message of m.messages) {
                this.tratarMensagens(message, sock, false, m)
            }
        })


        sock?.ev.on('messages.update', async (messages) => {
            const {key, update} = messages[0]
            const {id} = key
            const {status} = update
            if(status === 4) {
                await updateDataInTable('webhook', {instance_key: this.key, idMensagem: id}, {lida_zapp: true}) 
            }

        })
        sock?.ws.on('CB:call', async (data) => {
            //CB:call
        })

        sock?.ev.on('message-receipt.update', async(oi) => {
            //message-receipt.update
        })

        sock?.ev.on('groups.upsert', async (newChat) => {
            this.createGroupByApp(newChat)
            if (
                ['all', 'groups', 'groups.upsert'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook(
                    'group_created',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

        sock?.ev.on('groups.update', async (newChat) => {

            this.updateGroupSubjectByApp(newChat)
            if (
                ['all', 'groups', 'groups.update'].some((e) =>
                    config.webhookAllowedEvents.includes(e)
                )
            )
                await this.SendWebhook(
                    'group_updated',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

        sock?.ev.on('group-participants.update', async (newChat) => {
            this.updateGroupParticipantsByApp(newChat)
            if (
                [
                    'all',
                    'groups',
                    'group_participants',
                    'group-participants.update',
                ].some((e) => config.webhookAllowedEvents.includes(e))
            )
                await this.SendWebhook(
                    'group_participants_updated',
                    {
                        data: newChat,
                    },
                    this.key
                )
        })

    }


    async tratarMensagens(message, sock, ignore_bot = false, m){
        try{
            if(message.message.reactionMessage) {
                const {reactionMessage} = message.message
                const {id} = reactionMessage.key

                await updateDataInTable('webhook', {instance_key: this.key, idMensagem: id}, {reacao: reactionMessage.text})
                return
            }
            const {remoteJid} = message.key
            const isGroup = remoteJid.endsWith('@g.us')
            const isStatus = remoteJid.indexOf('status@') >= 0
            const messageType = Object.keys(message.message)[0]
            if(!isGroup && !isStatus) {
                const webhookMessage = await getWebhookMessage(message.key.id)
                if(webhookMessage) return

                await this.salvarMensagemWebHook(message, sock, ignore_bot, remoteJid, messageType)
            }
            if (config.markMessagesRead) {
                const unreadMessages = m.messages.map((msg) => {
                    return {
                        remoteJid: msg.key.remoteJid,
                        id: msg.key.id,
                        participant: msg.key?.participant,
                    }
                })
                await sock.readMessages(unreadMessages)
            }
        }catch(err){
            // process.exit()
        }
    }

    async conexaoRetorno(conexao, wppUser) {
        if(conexao['mensagemRetorno']){
            await this.sendTextMessage(wppUser, conexao['mensagemRetorno'])
        }
        if(conexao['id_contato_retorno']){
            const contato = await getContatoById(conexao['id_contato_retorno'])
            await this.sendContactMessage(wppUser, {
                fullName: contato.nome,
                organization: contato.nome,
                phoneNumber: contato.numero
            })
        }
        return
    }

    async salvarMensagemWebHook(message, sock, ignore_bot = false, remoteJid,messageType) {
        let wppUser = remoteJid.split('@')[0]
        if(wppUser.includes('-')) {
            wppUser = wppUser.split('-')[0]
        }

        const conexao = await getConexaoById(this.clientId)
        if(conexao.isConexaoRetorno) {
            await this.conexaoRetorno(conexao, wppUser)
        }

        const idApi = uuidv4()
        const conversa = await getSingleConversaByConexao(wppUser, this.key)

        let msg = message

        let fileName;
        let fileUrl;
        let bucketUrl = "https://fntyzzstyetnbvrpqfre.supabase.co/storage/v1/object/public/chat/arquivos"

        let quotedId
        let contactId
        let contatoId
        let imgUrl
        try {
            imgUrl = await sock.profilePictureUrl(remoteJid)
        } catch (e) {
            // erro
        }


        if(message.message.extendedTextMessage && message.message.extendedTextMessage.contextInfo.quotedMessage){
            const webhook  = await getIdWebHookMessage(message.message.extendedTextMessage.contextInfo.stanzaId)
            quotedId = webhook.id
        }
        let nomeContato = message.pushName 

        if(message.key.fromMe) {
            nomeContato = null
        }

        const contactExists = await getContato(wppUser, this.empresaId)
        if(!contactExists) {
            const numeroFormatado = formatarNumeroRelatorio(wppUser)
            const newContact = await sendDataToSupabase('contatos', {
                nome: nomeContato,
                numero: wppUser,
                ref_empresa: this.empresaId,
                status_conversa: 'Visualizar',
                numero_relatorios: numeroFormatado,
                foto: imgUrl,
            })
            contatoId = newContact.id
        } else {
            if(!contactExists.nome && nomeContato) {
                updateDataInTable('contatos', {id: contactExists.id}, {nome: nomeContato})
            }
            contatoId = contactExists.id
        }

        if(message.message.contactMessage){
            const waidRegex = /waid=(\d+):/
            const contact = message.message.contactMessage
            const displayName = contact.displayName
            const match = contact.vcard.match(waidRegex)

            if(match) {
                const number = match[1]
                const contact = await getContato(number, this.empresaId)
                if(!contact) {
                    let numeroFormatado
                    let numeroLocal = number.substring(2)
                    if(numeroLocal.length === 11) {
                        numeroFormatado = `(${numeroLocal.substring(0,2)}) ${numeroLocal.substring(2,7)}-${numeroLocal.substring(7)}`
                    } else if(numeroLocal.length === 10) {
                        numeroFormatado = `(${numeroLocal.substring(0,2)}) ${numeroLocal.substring(2,6)}-${numeroLocal.substring(6)}`
                    } else {
                        numeroFormatado = number
                    }
                    const newContact = await sendDataToSupabase('contatos', {
                        nome: displayName,
                        numero: number,
                        ref_empresa: this.empresaId,
                        status_conversa: 'Visualizar',
                        numero_relatorios: numeroFormatado
                    })
                    contactId = newContact.id
                } else {
                    contactId = contact.id
                }
            }
        }


        if(message.message.protocolMessage){
            const { protocolMessage } = message.message
            const webhook = await getIdWebHookMessage(protocolMessage.key.id)
            await updateDataInTable('webhook', {id: webhook.id}, {deletada: true})
            return
        }

        if(msg.message.documentMessage) {
            fileName = msg.message.documentMessage.fileName
        }

        if(conversa) {
            if(conversa.Status === 'Espera' || conversa.Status === 'Em Atendimento' || conversa.Status === 'Bot' || conversa.Status === 'Setor') {
                if(msg.message.extendedTextMessage) {
                    const text = msg.message.extendedTextMessage.text.toUpperCase().trim()
                    if (text === '#SAIR') {
                        await updateDataInTable('conversas', {id: conversa.id}, {Status: 'Finalizado'})
                        return
                    }
                }
                await this.salvaWebhookEAtualizaConversa(messageType, sock, msg, conversa, fileUrl, bucketUrl, message, fileName, quotedId, contactId, ignore_bot, contatoId)
                
                
            } else if(conversa.Status === 'Visualizar') {
                await this.cadastraConversaESalvaWebhook(msg, message, fileName, idApi, quotedId, contactId, ignore_bot, wppUser, imgUrl, contatoId, messageType, sock, fileUrl, bucketUrl)
                
            }else if (conversa.Status === 'Finalizado') {
            const bot = await getSingleBot(this.empresaId)
            const {tempo_retorno} = bot
            const {horario_ultima_mensagem} = conversa
            const horarioUltimaMensagem = new Date(horario_ultima_mensagem)
            const horarioAtual = new Date()
            const tempoRetornoMs = tempo_retorno * 60 * 1000
            const timestampHoraioFinal = horarioUltimaMensagem.getTime() + tempoRetornoMs
            const horarioMaisTempoRetorno = new Date(timestampHoraioFinal)
            const tempoRetornoValido = horarioAtual <= horarioMaisTempoRetorno
            if(tempoRetornoValido) {
                await this.salvaWebhookEAtualizaConversa(messageType, sock, msg, conversa, fileUrl, bucketUrl, message, fileName, quotedId, contactId, ignore_bot, contatoId, "Em Atendimento")
            } else {
                await this.cadastraConversaESalvaWebhook(msg, message, fileName, idApi, quotedId, contactId, ignore_bot, wppUser, imgUrl, contatoId, messageType, sock, fileUrl, bucketUrl)
            }
            }

        } else {
            await this.cadastraConversaESalvaWebhook(msg, message, fileName, idApi, quotedId, contactId, ignore_bot, wppUser, imgUrl, contatoId, messageType, sock, fileUrl, bucketUrl)
        }
    }

    async salvaWebhookEAtualizaConversa(messageType, sock, msg, conversa, fileUrl, bucketUrl, message, fileName, quotedId, contactId, ignore_bot, contatoId, status) {
        await this.workWithMessageType(messageType, sock, msg, conversa.id_api, fileUrl, bucketUrl)
        const webhook = await sendDataToSupabase('webhook', {
            data: msg,
            contatos: msg.key.remoteJid.split('@')[0],
            fromMe: message.key.fromMe,
            mensagem: fileName ? fileName : msg.message.conversation ? msg.message.conversation : null,
            'áudio': msg.message.audioMessage ? msg.message.audioMessage.url : null,
            imagem: msg.message.imageMessage? msg.message.imageMessage.url : null,
            'legenda imagem': msg.message.imageMessage ? msg.message.imageMessage.caption : null,
            file: msg.message.documentMessage ? msg.message.documentMessage.url : null,
            'legenda file': msg.message.documentWithCaptionMessage ? msg.message.documentWithCaptionMessage.message.caption : null,
            'id_api_conversa' : conversa.id_api,
            video: msg.message.videoMessage ? msg.message.videoMessage.url : null,
            idMensagem: msg.key.id,
            replyWebhook: quotedId,
            id_contato_webhook: contactId,
            instance_key: this.key,
            ignore_bot
        })
        if(status) {
            await updateDataInTable('conversas', {id: conversa.id}, {webhook_id_ultima: webhook.id, ref_contatos: contatoId, Status: status})
            return
        }
        await updateDataInTable('conversas', {id: conversa.id}, {webhook_id_ultima: webhook.id, ref_contatos: contatoId})
    }

    async cadastraConversaESalvaWebhook(msg, message, fileName, idApi, quotedId, contactId, ignore_bot, wppUser, imgUrl, contatoId, messageType, sock, fileUrl, bucketUrl){
        await this.workWithMessageType(messageType, sock, msg, idApi, fileUrl, bucketUrl)
                        const conversa = await sendDataToSupabase('conversas', {
                            numero_contato: wppUser,
                            foto_contato: imgUrl,
                            nome_contato: message.pushName,
                            ref_empresa: this.empresaId,
                            key_instancia: this.key,
                            id_api: idApi,
                            Status: 'Bot',
                            ref_contatos: contatoId
                        })
                        const webhook = await sendDataToSupabase('webhook', {
                            data: msg,
                            contatos: msg.key.remoteJid.split('@')[0],
                            fromMe: message.key.fromMe,
                            mensagem: fileName ? fileName : msg.message.conversation ? msg.message.conversation : null,
                            'áudio': msg.message.audioMessage ? msg.message.audioMessage.url : null,
                            imagem: msg.message.imageMessage? msg.message.imageMessage.url : null,
                            'legenda imagem': msg.message.imageMessage ? msg.message.imageMessage.caption : null,
                            file: msg.message.documentMessage ? msg.message.documentMessage.url : null,
                            'legenda file': msg.message.documentMessage ? msg.message.documentMessage.caption : null,
                            'id_api_conversa' : idApi,
                            video: msg.message.videoMessage ? msg.message.videoMessage.url : null,
                            idMensagem: msg.key.id,
                            replyWebhook: quotedId,
                            id_contato_webhook: contactId,
                            instance_key: this.key,
                            ignore_bot
                        })
                        updateDataInTable('conversas', {id: conversa.id}, {webhook_id_ultima: webhook.id})
    }

    async deleteInstance(key) {
        try {
            await updateDataInTable('conexoes', {id: this.clientId}, {status_conexao: 'desconectado', Status: false, instance_key: '', qrcode: ''})
            await updateDataInTable('colab_user', {id_empresa: this.empresaId}, {key_colabuser: ''})
            await updateDataInTable('Setores', {id_empresa: this.empresaId}, {key_conexao: ''})
            await updateDataInTable('Bot', {id_empresa: this.empresaId}, {'key_conexão': ''})
            await updateDataInTable('Empresa', {id: this.empresaId}, {key: ''})
            await Chat.findOneAndDelete({ key: key })

        } catch (e) {
            logger.error('Error updating document failed')
        }
    }

    async getInstanceDetail(key) {
        return {
            instance_key: key,
            phone_connected: this.instance?.online,
            webhookUrl: this.instance.customWebhook,
            user: this.instance?.online ? this.instance.sock?.user : {},
        }
    }

    async cadastraContatoDeConexao(numero) {
        const contatoExistente = await getContatoIsConexao(numero, this.empresaId)
        const numeroFormatado = formatarNumeroRelatorio(numero)
        if (contatoExistente){
                await updateDataInTable('contatos', {id: contatoExistente.id}, {
                    isconexao: true
                })
            return
        } 
        await sendDataToSupabase('contatos', {
            nome: this.name,
            numero, 
            isconexao: true,
            ref_empresa: this.empresaId,
            numero_relatorios: numeroFormatado
        })
    }

    async updateIntanceInfo() {
        const {user} = await this.getInstanceDetail(this.key)
        const {id, name} = user
        const phone = id.split('@')[0].split(':')[0]
        this.name = name
        const conexao = await getConexao(phone, this.empresaId, this.clientId)
        if(conexao) {
            if(conexao["Status"] === true){
                if(conexao['Nome']) {
                    await updateDataInTable('conexoes', {id: this.clientId}, {'Número': phone, status_conexao: 'Duplicado', qrcode: ''})
                } else {
                    await updateDataInTable('conexoes', {id: this.clientId}, {Nome: name, 'Número': phone, status_conexao: 'Duplicado', qrcode: ''})
                }
                
                this.duplicado = true
                await this.instance.sock?.logout()
                return
            } else {
                await updateDataInTable('conexoes', {id: this.clientId}, {'Número': phone, status_conexao: 'pronto', qrcode: '', Status: true, instance_key: this.key})
                await deleteDataFromtable('conexoes', {id: conexao.id})
                const setores = await fetchSetores(this.empresaId)
                for(const setor of setores) {
                    await sendDataToSupabase('setor_conexao', {
                        id_setor: setor.id,
                        id_conexao: this.clientId,
                        id_empresa: this.empresaId,
                        keyConexao: this.key
                    })
                }
            }
        } else {
            await updateDataInTable('conexoes', {id: this.clientId}, {status_conexao: 'pronto', Status: true, instance_key: this.key, qrcode: '', Nome: name, 'Número': phone})
            const setores = await fetchSetores(this.empresaId)
            for(const setor of setores) {
                await sendDataToSupabase('setor_conexao', {
                    id_setor: setor.id,
                    id_conexao: this.clientId,
                    id_empresa: this.empresaId,
                    keyConexao: this.key
                })
            }
        }
        await this.cadastraContatoDeConexao(phone)
    }

    getWhatsAppId(id) {
        if (id.includes('@g.us') || id.includes('@s.whatsapp.net')){
            return id
        } 
        return id.includes('-') ? id+'@g.us' : id+'@s.whatsapp.net'
    }

    async verifyId(id) {
        if (id.includes('@g.us')) return true
        const [result] = await this.instance.sock?.onWhatsApp(id)
        if (result?.exists) return true
        throw new Error('no account exists')
    }

    async sendTextMessage(to, message) {
        await this.verifyId(this.getWhatsAppId(to))
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            { text: message }
        )
        data.instance_key = this.key
        return data
    }

    async deleteMessage(to, data) {
        const wid = this.getWhatsAppId(to)
        await this.verifyId(wid)
        const deletedMessage = await this.instance.sock?.sendMessage(
            wid, {delete: data.key}
        )
        return deletedMessage
    }

    async getGroups() {
        const data = await this.instance.sock?.groupFetchAllParticipating()

        let resultado = null

        for(let chave in data) {
            if (data[chave].subject === 'Arquivos') {
                resultado = {
                    name: data[chave].subject,
                    jid: chave
                }
                break;
            }
        }

        return resultado
    }

    async replyMessage(to, message, content) {
        const jid = this.getWhatsAppId(to)
        await this.verifyId(jid)

        const data = await this.instance.sock?.sendMessage(
            jid,
            { text: content },
            { quoted: message }
        )
        return data
    }

    async audioUrlToFile(to, url) {
        await this.verifyId(this.getWhatsAppId(to))

        const fileName = new Date().toISOString()
        const inputPath = path.join(__dirname, `${fileName}.mp3`)
        //const outputPath = path.join(__dirname, `${fileName}.mp3`)
        
        await this.downloadFile(url, inputPath)
        //await this.convertOpusToMp3(inputPath, outputPath)

        const buffer = fs.readFileSync(inputPath)
        const mimetype = mime.lookup(inputPath)

        const data = await this.instance.sock?.sendMessage(this.getWhatsAppId(to),{
            mimetype,
            audio: buffer,
            ptt: true,
            fileName
        })

        fs.unlinkSync(inputPath)
        return data
        //newUrl = `https://fntyzzstyetnbvrpqfre.supabase.co/storage/v1/object/public/chat/arquivos/${fileName}.mp3`
    }

    async sendMediaFile(to, file, type, caption = '', filename) {
        await this.verifyId(this.getWhatsAppId(to))
        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                mimetype: file.mimetype,
                [type]: file.buffer,
                caption: caption,
                ptt: type === 'audio' ? true : false,
                fileName: filename ? filename : file.originalname,
            }
        )
        return data
    }

    async replyWithMediaFile(to, file, type, caption = '', filename, message) {
        const jid = this.getWhatsAppId(to)
        await this.verifyId(jid)

        const data = await this.instance.sock?.sendMessage(
            jid,
            {
                mimetype: file.mimetype,
                [type]: file.buffer,
                caption: caption,
                ptt: type === 'audio' ? true : false,
                fileName: filename ? filename : file.originalname,
            },
            {quoted: message}
        )
        return data
    }

    async downloadFile(fileUrl, outputPath) {
        const writer = fs.createWriteStream(outputPath)

        const response = await axios({
            url: fileUrl,
            method: 'GET',
            responseType: 'stream'
        })

        response.data.pipe(writer)

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve)
            writer.on('error', reject)
        })
    }

    async convertOpusToMp3(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
            .toFormat('mp3')
            .on('error', (err) => {
                console.error('An error occurred: ' + err.message)
                reject()
            })
            .on('progress', (progress) => {
            })
            .on('end', () => {
                resolve()
            })
            .save(outputPath)
        })
        
    }

    async sendUrlMediaFile(to, url, type, mimeType, caption = '') {
        await this.verifyId(this.getWhatsAppId(to))


        let newUrl = url

        if(type === 'audio') {
            const fileName = new Date().toISOString()
            const inputPath = path.join(__dirname, `${fileName}.opus`)
            const outputPath = path.join(__dirname, `${fileName}.mp3`)
            
            await this.downloadFile(url, inputPath)
            await this.convertOpusToMp3(inputPath, outputPath)
            await uploadSUp(outputPath, `${fileName}.mp3`)
            fs.unlinkSync(inputPath)
            newUrl = `https://fntyzzstyetnbvrpqfre.supabase.co/storage/v1/object/public/chat/arquivos/${fileName}.mp3`
        }

        const data = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [type]: {
                    url: newUrl,
                },
                caption: caption,
                mimetype: mimeType,
            }
        )
        return data
    }

    async DownloadProfile(of) {
        const id = this.getWhatsAppId(of)
        await this.verifyId(id)
        
        const ppUrl = await this.instance.sock?.profilePictureUrl(
            id,
            'image'
        )
        return ppUrl
    }

    async getUserStatus(of) {
        const jid = this.getWhatsAppId(of)
        await this.verifyId(jid)
        const status = await this.instance.sock?.fetchStatus(
            jid
        )
        return status
    }

    async blockUnblock(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const status = await this.instance.sock?.updateBlockStatus(
            this.getWhatsAppId(to),
            data
        )
        return status
    }

    async sendButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                templateButtons: processButton(data.buttons),
                text: data.text ?? '',
                footer: data.footerText ?? '',
                viewOnce: true,
            }
        )
        return result
    }

    async sendContactMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const vcard = generateVC(data)
        const result = await this.instance.sock?.sendMessage(
            await this.getWhatsAppId(to),
            {
                contacts: {
                    displayName: data.fullName,
                    contacts: [{ displayName: data.fullName, vcard }],
                },
            }
        )
        return result
    }

    async sendListMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))
        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                text: data.text,
                sections: data.sections,
                buttonText: data.buttonText,
                footer: data.description,
                title: data.title,
                viewOnce: true,
            }
        )
        return result
    }

    async sendMediaButtonMessage(to, data) {
        await this.verifyId(this.getWhatsAppId(to))

        const result = await this.instance.sock?.sendMessage(
            this.getWhatsAppId(to),
            {
                [data.mediaType]: {
                    url: data.image,
                },
                footer: data.footerText ?? '',
                caption: data.text,
                templateButtons: processButton(data.buttons),
                mimetype: data.mimeType,
                viewOnce: true,
            }
        )
        return result
    }

    // async sendButton(to, data\)

    async setStatus(status, to) {
        await this.verifyId(this.getWhatsAppId(to))

        const result = await this.instance.sock?.sendPresenceUpdate(status, to)
        return result
    }

    // change your display picture or a group's
    async updateProfilePicture(id, url) {
        try {
            const img = await axios.get(url, { responseType: 'arraybuffer' })
            const res = await this.instance.sock?.updateProfilePicture(
                id,
                img.data
            )
            return res
        } catch (e) {
            return {
                error: true,
                message: 'Unable to update profile picture',
            }
        }
    }

    // get user or group object from db by id
    async getUserOrGroupById(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === this.getWhatsAppId(id))
            if (!group)
                throw new Error(
                    'unable to get group, check if the group exists'
                )
            return group
        } catch (e) {
            logger.error(e)
            logger.error('Error get group failed')
        }
    }

    // Group Methods
    parseParticipants(users) {
        return users.map((users) => this.getWhatsAppId(users))
    }

    async updateDbGroupsParticipants() {
        try {
            let groups = await this.groupFetchAllParticipating()
            let Chats = await this.getChat()
            if (groups && Chats) {
                for (const [key, value] of Object.entries(groups)) {
                    let group = Chats.find((c) => c.id === value.id)
                    if (group) {
                        let participants = []
                        for (const [
                            key_participant,
                            participant,
                        ] of Object.entries(value.participants)) {
                            participants.push(participant)
                        }
                        group.participant = participants
                        if (value.creation) {
                            group.creation = value.creation
                        }
                        if (value.subjectOwner) {
                            group.subjectOwner = value.subjectOwner
                        }
                        Chats.filter((c) => c.id === value.id)[0] = group
                    }
                }
                await this.updateDb(Chats)
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating groups failed')
        }
    }

    async createNewGroup(name, users) {
        try {
            const group = await this.instance.sock?.groupCreate(
                name,
                users.map(this.getWhatsAppId)
            )
            return group
        } catch (e) {
            logger.error(e)
            logger.error('Error create new group failed')
        }
    }

    async addNewParticipant(id, users) {
        try {
            const res = await this.instance.sock?.groupAdd(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'Unable to add participant, you must be an admin in this group',
            }
        }
    }

    async makeAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupMakeAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'unable to promote some participants, check if you are admin in group or participants exists',
            }
        }
    }

    async demoteAdmin(id, users) {
        try {
            const res = await this.instance.sock?.groupDemoteAdmin(
                this.getWhatsAppId(id),
                this.parseParticipants(users)
            )
            return res
        } catch {
            return {
                error: true,
                message:
                    'unable to demote some participants, check if you are admin in group or participants exists',
            }
        }
    }

    async getAllGroups() {
        let Chats = await this.getChat()
        return Chats.filter((c) => c.id.includes('@g.us')).map((data, i) => {
            return {
                index: i,
                name: data.name,
                jid: data.id,
                participant: data.participant,
                creation: data.creation,
                subjectOwner: data.subjectOwner,
            }
        })
    }

    async leaveGroup(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === id)
            if (!group) throw new Error('no group exists')
            return await this.instance.sock?.groupLeave(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error leave group failed')
        }
    }

    async getInviteCodeGroup(id) {
        try {
            let Chats = await this.getChat()
            const group = Chats.find((c) => c.id === id)
            if (!group)
                throw new Error(
                    'unable to get invite code, check if the group exists'
                )
            return await this.instance.sock?.groupInviteCode(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error get invite group failed')
        }
    }

    async getInstanceInviteCodeGroup(id) {
        try {
            return await this.instance.sock?.groupInviteCode(id)
        } catch (e) {
            logger.error(e)
            logger.error('Error get invite group failed')
        }
    }

    // get Chat object from db
    async getChat(key = this.key) {
        let dbResult = await Chat.findOne({ key: key }).exec()
        let ChatObj = dbResult.chat
        return ChatObj
    }

    // create new group by application
    async createGroupByApp(newChat) {
        try {
            let Chats = await this.getChat()
            let group = {
                id: newChat[0].id,
                name: newChat[0].subject,
                participant: newChat[0].participants,
                messages: [],
                creation: newChat[0].creation,
                subjectOwner: newChat[0].subjectOwner,
            }
            Chats.push(group)
            await this.updateDb(Chats)
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async updateGroupSubjectByApp(newChat) {
        try {
            if (newChat[0] && newChat[0].subject) {
                let Chats = await this.getChat()
                Chats.find((c) => c.id === newChat[0].id).name =
                    newChat[0].subject
                await this.updateDb(Chats)
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async updateGroupParticipantsByApp(newChat) {
        try {
            if (newChat && newChat.id) {
                let Chats = await this.getChat()
                let chat = Chats.find((c) => c.id === newChat.id)
                let is_owner = false
                if (chat) {
                    if (chat.participant == undefined) {
                        chat.participant = []
                    }
                    if (chat.participant && newChat.action == 'add') {
                        for (const participant of newChat.participants) {
                            chat.participant.push({
                                id: participant,
                                admin: null,
                            })
                        }
                    }
                    if (chat.participant && newChat.action == 'remove') {
                        for (const participant of newChat.participants) {
                            // remove group if they are owner
                            if (chat.subjectOwner == participant) {
                                is_owner = true
                            }
                            chat.participant = chat.participant.filter(
                                (p) => p.id != participant
                            )
                        }
                    }
                    if (chat.participant && newChat.action == 'demote') {
                        for (const participant of newChat.participants) {
                            if (
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0]
                            ) {
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0].admin = null
                            }
                        }
                    }
                    if (chat.participant && newChat.action == 'promote') {
                        for (const participant of newChat.participants) {
                            if (
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0]
                            ) {
                                chat.participant.filter(
                                    (p) => p.id == participant
                                )[0].admin = 'superadmin'
                            }
                        }
                    }
                    if (is_owner) {
                        Chats = Chats.filter((c) => c.id !== newChat.id)
                    } else {
                        Chats.filter((c) => c.id === newChat.id)[0] = chat
                    }
                    await this.updateDb(Chats)
                }
            }
        } catch (e) {
            logger.error(e)
            logger.error('Error updating document failed')
        }
    }

    async groupFetchAllParticipating() {
        try {
            const result =
                await this.instance.sock?.groupFetchAllParticipating()
            return result
        } catch (e) {
            logger.error('Error group fetch all participating failed')
        }
    }

    // update promote demote remove
    async groupParticipantsUpdate(id, users, action) {
        try {
            const res = await this.instance.sock?.groupParticipantsUpdate(
                this.getWhatsAppId(id),
                this.parseParticipants(users),
                action
            )
            return res
        } catch (e) {
            return {
                error: true,
                message:
                    'unable to ' +
                    action +
                    ' some participants, check if you are admin in group or participants exists',
            }
        }
    }

    // update group settings like
    // only allow admins to send messages
    async groupSettingUpdate(id, action) {
        try {
            const res = await this.instance.sock?.groupSettingUpdate(
                this.getWhatsAppId(id),
                action
            )
            return res
        } catch (e) {
            return {
                error: true,
                message:
                    'unable to ' + action + ' check if you are admin in group',
            }
        }
    }

    async groupUpdateSubject(id, subject) {
        try {
            const res = await this.instance.sock?.groupUpdateSubject(
                this.getWhatsAppId(id),
                subject
            )
            return res
        } catch (e) {
            return {
                error: true,
                message:
                    'unable to update subject check if you are admin in group',
            }
        }
    }

    async groupUpdateDescription(id, description) {
        try {
            const res = await this.instance.sock?.groupUpdateDescription(
                this.getWhatsAppId(id),
                description
            )
            return res
        } catch (e) {
            return {
                error: true,
                message:
                    'unable to update description check if you are admin in group',
            }
        }
    }

    // update db document -> chat
    async updateDb(object) {
        try {
            await Chat.updateOne({ key: this.key }, { chat: object })
        } catch (e) {
            logger.error('Error updating document failed')
        }
    }

    async readMessage(msgObj) {
        try {
            const key = {
                remoteJid: msgObj.remoteJid,
                id: msgObj.id,
                participant: msgObj?.participant, // required when reading a msg from group
            }
            const res = await this.instance.sock?.readMessages([key])
            return res
        } catch (e) {
            logger.error('Error read message failed')
        }
    }

    async reactMessage(id, key, emoji) {
        try {
            const reactionMessage = {
                react: {
                    text: emoji, // use an empty string to remove the reaction
                    key: key,
                },
            }
            const res = await this.instance.sock?.sendMessage(
                this.getWhatsAppId(id),
                reactionMessage
            )
            return res
        } catch (e) {
            logger.error('Error react message failed')
        }
    }

    async workWithMessageType(messageType, sock, msg, id_api, fileUrl, bucketUrl) {
        switch(messageType) {
            case 'imageMessage':
                await this.downloadMessageSup(sock, msg, 'jpeg');
    
                fileUrl = `${bucketUrl}/${msg.key.id}.jpeg`
                msg.message['imageMessage']['url'] = fileUrl
                
                break; 
            case 'videoMessage':
                await this.downloadMessageSup(sock, msg, 'mp4');
                
                fileUrl = `${bucketUrl}/${msg.key.id}.mp4`
                msg.message['videoMessage']['url'] = fileUrl
                
                break;
            case 'audioMessage':
                    await this.downloadMessageSup(sock, msg, 'mp3');
                    
                    fileUrl = `${bucketUrl}/${msg.key.id}.mp3`
                    msg.message['audioMessage']['url'] = fileUrl
                    
                    break;
            case 'documentMessage':
                const format = `${msg.message['documentMessage']['mimetype'].split('/')[1]}`
                await this.downloadMessageSup(sock, msg, format)
    
                fileUrl = `${bucketUrl}/${msg.key.id}.${format}`
                msg.message['documentMessage']['url'] = fileUrl
    
                break
            case 'extendedTextMessage':
                break
            case 'messageContextInfo':
                if(msg.message.documentWithCaptionMessage){
                const format2 = `${msg.message.documentWithCaptionMessage.message['documentMessage']['mimetype'].split('/')[1]}`
                await this.downloadMessageSup(sock, msg.message.documentWithCaptionMessage, format2, msg.key.id)
                fileUrl = `${bucketUrl}/${msg.key.id}.${format2}`
                msg.message.documentMessage = {
                    url: fileUrl,
                    caption: msg.message.documentWithCaptionMessage.message['documentMessage'].caption
                }
                }
                
                break
            
        }
        msg.key['conversaId'] = id_api
    }

    async logout(){
        await this.instance.sock?.logout()
        await updateDataInTable('conexoes', {id: this.clientId}, {status_conexao: 'desconectado', qrcode: '', Status: false})
        await deleteDataFromtable('setor_conexao', {id_conexao: this.clientId})
        delete WhatsAppInstances[this.key]
    }
}



exports.WhatsAppInstance = WhatsAppInstance

