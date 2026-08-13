const nodes = [{
  id: 'HeavenCloud',
  host: '89.106.84.59',
  port: 4000,
  authorization: 'heavencloud.in',
  secure: false
}, {
  id: 'DevamOP',
  host: 'lavalink.devamop.in',
  port: 443,
  authorization: 'DevamOP',
  secure: true
}, {
  id: 'Lavalink-v4-EU',
  host: 'lava-v4.ajieblogs.eu.org',
  port: 443,
  authorization: 'https://dsc.gg/ajidevserver',
  secure: true
}, {
  id: 'Jirayu',
  host: 'lavalink.jirayu.net',
  port: 13592,
  authorization: 'youshallnotpass',
  secure: false
}, {
  id: 'NyxBot',
  host: 'sg1-nodelink.nyxbot.app',
  port: 3000,
  authorization: 'nyxbot.app/support',
  secure: false
}, {
  id: 'TriniumHost',
  host: 'lavalink.triniumhost.com',
  port: 4333,
  authorization: 'free',
  secure: false
}, {
  id: 'MilloHost',
  host: 'lava-v4.millohost.my.id',
  port: 443,
  authorization: 'https://discord.gg/mjS5J2K3ep',
  secure: true
}, {
  id: 'Kasawa',
  host: 'lava2.kasawa.pro',
  port: 2334,
  authorization: 'youshallnotpass',
  secure: false
}];

async function testNodes() {
  for (const node of nodes) {
    const protocol = node.secure ? 'https' : 'http';
    const url = `${protocol}://${node.host}:${node.port}/v4/info`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(url, {
        headers: {
          'Authorization': node.authorization
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        console.log(`✅ ${node.id} is ALIVE`);
      } else if (res.status === 404) {
        console.log(`✅ ${node.id} is ALIVE (likely v3, returned 404 for /v4)`);
      } else {
        console.log(`❌ ${node.id} is ALIVE but returned ${res.status}`);
      }
    } catch (e) {
      console.log(`❌ ${node.id} is DEAD: ${e.message}`);
    }
  }
}

testNodes();
