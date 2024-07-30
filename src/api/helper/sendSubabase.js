const { createClient } = require('@supabase/supabase-js');

// Create a single supabase client for interacting with your database

const uriSupabase = global.production ? 'https://fntyzzstyetnbvrpqfre.supabase.co' : 'https://ndxedvhrarwaiyrcvdzp.supabase.co'
const apiKeySupabase = global.production ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZudHl6enN0eWV0bmJ2cnBxZnJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTExMTM0NzksImV4cCI6MjAwNjY4OTQ3OX0.eaod7DsHG3Pc1ZBFSmvr3r6by-MtNf0hzjgjXzdN3Jk' : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5keGVkdmhyYXJ3YWl5cmN2ZHpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE4Njk5OTEsImV4cCI6MjAzNzQ0NTk5MX0.lqwaEjPF5VuVWgxjZYdU_QWQELDknA9uYUzt-aoSRU4'


 /** * Insert a new record into the specified table * @param {string} tableName 
 - The name of the table to insert the data into. * @param {object} data - The 
 data to insert. */

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendDataToSupabase(tableName, data) { 
    try { 
        const supabase = createClient( uriSupabase, apiKeySupabase);
        const response = await supabase.from(tableName).insert([data]); 
        if(response.error) {
            console.error('Error inserting data:', response.error);
        } else {
            // oie
        }
    } catch (error) {
        console.error('An unexpected error occurred:', error);
    }
}
module.exports = sendDataToSupabase;
