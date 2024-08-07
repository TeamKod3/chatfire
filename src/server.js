const dotenv = require('dotenv')
const mongoose = require('mongoose')
const logger = require('pino')()
dotenv.config()

const app = require('./config/express')
const config = require('./config/config')
const initDBStats = require('./api/db/db')

const { Session } = require('./api/class/session')
const connectToCluster = require('./api/helper/connectMongoClient')
const { getConversasWhereBot, getSingleBot, getSingleSetor, updateDataInTable } = require('./api/helper/sendSupabase')
const { BSONType } = require('mongodb')

if (config.mongoose.enabled) {
    mongoose.set('strictQuery', true);
    mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
        // logger.info('Connected to MongoDB')
    })
}

global.production = true

initDBStats()

const server = app.listen(config.port, async () => {
    console.log('Listening on port: ', config.port)
    global.mongoClient = await connectToCluster(config.mongoose.url)
    if (config.restoreSessionsOnStartup) {
        const session = new Session()
        let restoreSessions = await session.restoreSessions()
        logger.info(`${restoreSessions.length} Session(s) Restored`)
    }
})

const exitHandler = () => {
    if (server) {
        server.close(() => {
            process.exit(1)
        })
    } else {
        process.exit(1)
    }
}

setInterval( async () => {
    const conversas = await getConversasWhereBot()
    if(conversas) {
        for (const conversa of conversas) {
            const {horario_ultima_mensagem} = conversa
            const horarioUltimaMensagem = new Date(horario_ultima_mensagem)
            const horarioAtual = new Date()
            const bot = await getSingleBot(conversa.ref_empresa)
            // console.log({conversa, bot})
            if(bot.ativo === true) {
                const {tempo_transferencia} = bot
                const tempoTransferenciaMs = tempo_transferencia * 60 * 1000

                const horarioMaisTempoTransferencia = new Date(horarioUltimaMensagem.getTime() + tempoTransferenciaMs)

                const tempoRespostaExpirado = horarioAtual >= horarioMaisTempoTransferencia
                if(tempoRespostaExpirado) {
                    const instance = WhatsAppInstances[conversa.key_instancia]
                    const setor = await getSingleSetor(bot.setor_inatividade)
                    await updateDataInTable('conversas', {id: conversa.id}, {Status: "Espera", id_setor: setor.id, isespera: true, isforahorario: false})
                    await instance.sendTextMessage(
                        conversa.numero_contato,
                        `Atendimento transferido para o setor ${setor.Nome} por inatividade do usuário`
                    )
                }
            }
            
        }
    }
}, 1000 * 60) // 1 minuto

const unexpectedErrorHandler = (error) => {
    logger.error(error)
    exitHandler()
}

process.on('uncaughtException', unexpectedErrorHandler)
process.on('unhandledRejection', unexpectedErrorHandler)

process.on('SIGTERM', () => {
    if (server) {
        server.close()
    }
})

module.exports = server
