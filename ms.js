const https = require('https');

// Lavalink config
const LAVALINK = {
    host: 'lava-v4.ajieblogs.eu.org',
    port: 443,
    password: 'https://dsc.gg/ajidevserver'
};

// Test cases
const TESTS = [
    { name: 'Spotify URL', query: 'https://open.spotify.com/track/2UnxSOkAHLyVocAQM1mmke' },
    { name: 'Spotify Search', query: 'spsearch:never gonna give you up' },
    { name: 'YouTube Search', query: 'ytsearch:never gonna give you up' }
];

console.log('🧪 Testing Lavalink Spotify Support\n');

// Make request to Lavalink
function lavalinkRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: LAVALINK.host,
            port: LAVALINK.port,
            path: path,
            method: 'GET',
            headers: {
                'Authorization': LAVALINK.password
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

async function test() {
    // Step 1: Check node info
    console.log('📊 Step 1: Checking Lavalink Info...\n');
    try {
        const info = await lavalinkRequest('/v4/info');
        console.log(`✅ Lavalink Version: ${info.version?.semver || 'Unknown'}`);
        
        if (info.sourceManagers) {
            console.log(`\n📦 Source Managers:`);
            info.sourceManagers.forEach(sm => console.log(`   - ${sm}`));
            
            const hasSpotify = info.sourceManagers.some(sm => 
                sm.toLowerCase().includes('spotify')
            );
            console.log(`\n${hasSpotify ? '✅' : '❌'} Spotify: ${hasSpotify ? 'ENABLED' : 'NOT FOUND'}`);
        }
        
        if (info.plugins?.length) {
            console.log(`\n🔌 Plugins:`);
            info.plugins.forEach(p => console.log(`   - ${p.name} v${p.version}`));
        }
    } catch (error) {
        console.error('❌ Failed to get info:', error.message);
    }

    // Step 2: Test queries
    console.log('\n\n📊 Step 2: Testing Track Loading...\n');
    
    for (const test of TESTS) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🔍 ${test.name}`);
        console.log(`Query: ${test.query}`);
        console.log('─'.repeat(60));
        
        try {
            const encodedQuery = encodeURIComponent(test.query);
            const result = await lavalinkRequest(`/v4/loadtracks?identifier=${encodedQuery}`);
            
            console.log(`Load Type: ${result.loadType}`);
            
            // Handle different v4 response formats
            let tracks = [];
            if (Array.isArray(result.data)) {
                // Search results: array of tracks
                tracks = result.data;
            } else if (result.data?.encoded) {
                // Single track: object
                tracks = [result.data];
            } else if (result.data?.tracks) {
                // Playlist: object with tracks array
                tracks = result.data.tracks;
            }
            
            if (tracks.length > 0) {
                const track = tracks[0];
                
                console.log(`\n✅ Found Track!`);
                console.log(`   Title: ${track.info?.title}`);
                console.log(`   Author: ${track.info?.author}`);
                console.log(`   Source: ${track.info?.sourceName}`);
                console.log(`   URI: ${track.info?.uri}`);
                console.log(`   Artwork: ${track.info?.artworkUrl ? '✅ Yes' : '❌ No'}`);
                console.log(`   ISRC: ${track.info?.isrc || 'N/A'}`);
                console.log(`   Encoded: ${track.encoded ? '✅ Yes' : '❌ No'}`);
                
                // Check if it's actually Spotify or converted
                if (test.name.includes('Spotify')) {
                    const isNativeSpotify = track.info?.sourceName?.toLowerCase() === 'spotify';
                    const hasSpotifyUri = track.info?.uri?.includes('spotify');
                    
                    console.log(`\n   🎵 Spotify Check:`);
                    console.log(`      Native Spotify Source: ${isNativeSpotify ? '✅ YES' : '❌ NO'}`);
                    console.log(`      Spotify URI: ${hasSpotifyUri ? '✅ YES' : '❌ NO'}`);
                    
                    if (!isNativeSpotify && hasSpotifyUri) {
                        console.log(`      ⚠️  CONVERTED: Spotify → ${track.info?.sourceName}`);
                    }
                }
                
            } else {
                console.log('❌ No tracks found');
            }
            
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
    }
    
    console.log('\n\n' + '═'.repeat(60));
    console.log('✅ Test Complete!');
    console.log('═'.repeat(60) + '\n');
}

test().catch(console.error);