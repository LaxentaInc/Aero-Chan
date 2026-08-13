const axios = require('axios');

axios.defaults.headers.common['User-Agent'] = 'AeroDiscordBot/1.0 (Discord: laxenta)';

async function test() {
    try {
        const res = await axios.get('https://nekos.best/api/v2/bite', { timeout: 5000 });
        console.log("SUCCESS:", res.data.results[0].url);
    } catch (e) {
        console.error("FAIL:", e.response ? e.response.status : e.message);
    }
}
test();
