const { createClient } = require('@supabase/supabase-js');
const { unlinkSync, readFileSync } = require('fs');

// Create a single supabase client for interacting with your database

        let uriSupabase = ''
        let apiKeySupabase = ''


 /** * Insert a new record into the specified table * @param {string} tableName 
 - The name of the table to insert the data into. * @param {object} data - The 
 data to insert. */

 function setUri() {
    uriSupabase = global.production === true ? 'https://fntyzzstyetnbvrpqfre.supabase.co' : 'https://ndxedvhrarwaiyrcvdzp.supabase.co'
    apiKeySupabase = global.production === true ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudHl6enN0eWV0bmJ2cnBxZnJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5MTExMzQ3OSwiZXhwIjoyMDA2Njg5NDc5fQ.-GyuYGIJFORK6qO7URMRfERfDHT3tBbfaONwdMEUSms' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5keGVkdmhyYXJ3YWl5cmN2ZHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE4Njk5OTEsImV4cCI6MjAzNzQ0NTk5MX0.lqwaEjPF5VuVWgxjZYdU_QWQELDknA9uYUzt-aoSRU4'
 }

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendDataToSupabase(tableName, data) {
	try {  
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const response = await supabase.from(tableName).insert([data]).select()
        if(response.error) {
            console.error('Error inserting data:', response.error, {tableName, data});
            return null
        } else {
            return response.data[0]
        }
    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}
async function fetchAllDataFromTable(tableName) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from(tableName).select('*');

        if(error) {
            console.error('Error fetching data:', error);
        }else {
            return data
        }
    }catch(error) {
        console.error('An unexpected error occurred:', error);
        return null
    }
}

async function fetchSetores(empresaId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('Setores').select('*').eq('id_empresas', empresaId).order('created_at', {ascending: false})
        if(error) {
            console.error('Deu erro no supabase fetchSetores erro: ', error)
            return null
        } else {
            return data.length > 0 ? data : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getConexao(numero, empresaId, conexaoId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('conexoes').select('*').eq('Número', numero).eq('id_empresa', empresaId).neq('id', conexaoId).order('created_at', {ascending: false}).limit(1)
        if(error) {
            console.error('Deu erro no supabase getConexao erro: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getWebhookMessage(id) {
    try {
        setUri()
        const supabase = createClient(uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('webhook').select('*').eq('idMensagem', id).order('created_at', {ascending: false}).limit(1)
        if(error) {
            console.error('Deu erro no supabase getConexao erro: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    }catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getConexaoById(conexaoId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('conexoes').select('*').eq('id', conexaoId).limit(1)
        if(error) {
            console.error('Deu erro no supabase getConexaoById erro: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getIdConexoes(tableName, condition) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from(tableName).select('id, id_empresa, Nome').eq('instance_key', condition).single()

        if(error) {
            return null
        } else {
            return data
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getIdWebHookMessage(id) {
    try{
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('webhook').select('*').eq('idMensagem', id).order('created_at', {ascending: false}).limit(1)
        if(error){
            console.error('Deu erro no supabase getIdWebHookMessage erro: ', error)
            return null
        }
        return data.length > 0 ? data[0] : null
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }

}

async function getSingleWebhook(data) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('webhook').select('*').eq('data', data).single()
        if(error) {
            return null
        } else {
            return data
        }
    }catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getSingleConversa(numero, empresaId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('conversas').select('*').eq('numero_contato', numero).eq('ref_empresa', empresaId).order('created_at', {ascending: false}).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getSingleConversa: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getSingleConversaByConexao(numero, keyInstancia) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('conversas').select('*').eq('numero_contato', numero).eq('key_instancia', keyInstancia).order('created_at', {ascending: false}).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getSingleConversaByConexao: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getSingleSetor(setorId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('Setores').select('*').eq('id', setorId).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getSingleSetor: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getSingleBot(empresaId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('Bot').select('*').eq('id_empresa', empresaId).order('created_at', {ascending: false}).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getSingleBot: ', error)
            return null
        } else {
            return data.length > 0 ? data[0] : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getConversasWhereBot() {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('conversas').select('*').in('Status', ['Bot', 'Setor']).order('created_at', {ascending: false}).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getConversasWhereBot: ', error)
            return null
        } else {
            return data.length > 0 ? data : null
        }
    } catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getContatoIsConexao(numero, empresaId ) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('contatos').select('*').eq('numero', numero).eq('ref_empresa', empresaId).limit(1)
        if(error) {
            console.error('Ocorreu um erro inesperado na função getContatoIsConexao: ', error)
            return null
        }
        return data.length > 0 ? data[0] : null
    }catch(error) {
        console.error('Ocorreu um erro inesperado na função getContatoIsConexao:', error)
        return null
    }
} 
async function getContato(numero, empresaId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('contatos').select('*').eq('numero', numero).eq('ref_empresa', empresaId).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getContato: ', error)
            return null
        }
        return data.length > 0 ? data[0] : null
    }catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function getContatoById(contactId) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from('contatos').select('*').eq('id', contactId).limit(1)
        if(error) {
            console.error('Deu erro no supabase erro getContatoById: ', error)
            return null
        }
        return data.length > 0 ? data[0] : null
    }catch(error) {
        console.error('Ocorreu um erro inesperado', error)
        return null
    }
}

async function updateDataInTable(tableName, matchCriteria, newData) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from(tableName).update(newData).match(matchCriteria)

        if(error) { 
            console.error('Error updating data:',{tableName, matchCriteria, newData} ,error);
            return null
        } else {
            return data
        }
    } catch(error) {
        console.error('An unexpected error occurred:', error);
        return null
    }
}

async function verifyConversaId(userNumber, key) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const { data, error } = await supabase
            .from('conversas')
            .select('*')
            .eq('numero_contato', userNumber)
            .eq('key_instancia', key)
	    .neq('Status', 'Finalizado')


        if (error) {
            console.error('Erro ao verificar dados', error);
            return false;
        }

        return data;
    } catch (err) {
        console.error('Erro durante a consulta', err);
        return false;
    }
}

async function adicionaRegistro(userNumber, key, idApi, nome) {
    setUri()
    const supabase = createClient( uriSupabase, apiKeySupabase);
    const dadoExiste = await verifyConversaId(userNumber, key);
    if (dadoExiste.length == 0) {
        const { data, error } = await supabase
            .from('conversas')
            .insert([{ nome_contato: nome, numero_contato: userNumber, key_instancia: key, id_api: idApi }]);
        
        if (error) {
            return false;
        }

        const resultNew = await verifyConversaId(userNumber, key);
        return resultNew;
    } else {
        return dadoExiste;
    }
}

async function uploadSUp(filePath, filename) {
    const fileContent = readFileSync(filePath)
    const storagePath = `arquivos/${filename}`;
    setUri()
    const supabase = createClient( uriSupabase, apiKeySupabase);

    let { error } = await supabase.storage
    .from('chat')
    .upload(storagePath, fileContent);
    
    if (error) throw error;
    unlinkSync(filePath)

}

async function deleteDataFromtable(tableName, matchCriteria) {
    try {
        setUri()
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const {data, error} = await supabase.from(tableName).delete().match(matchCriteria)

        if (error) {
            console.error('Error deleting data:', error);
            return null;
        } else {
            return data;
        }
    }catch (error) {
        console.error('An unexpected error occurred:', error);
        return null;
    }
}


module.exports = {
    sendDataToSupabase,
    adicionaRegistro,
    fetchAllDataFromTable,
    updateDataInTable,
    uploadSUp,
    deleteDataFromtable,
    getIdConexoes,
    getSingleConversa,
    getSingleWebhook,
    getIdWebHookMessage,
    getContato,
    fetchSetores,
    getConexao,
    getConversasWhereBot, 
    getSingleBot,
    getSingleSetor,
    getConexaoById,
    getContatoById,
    getSingleConversaByConexao,
    getWebhookMessage,
    getContatoIsConexao
};

