const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const INVENTARIO_FILE = path.join(__dirname, 'inventario.json');

// Configuración de reconexión automática
const RECONNECT_CONFIG = {
    maxReconnects: Infinity,
    reconnectDelay: 5000,
    maxReconnectDelay: 60000,
    backoffMultiplier: 1.5
};

let reconnectAttempts = 0;
let isShuttingDown = false;

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    restTimeOffset: 0,
    restWsBridgeTimeout: 100,
    restRequestTimeout: 15000,
    failIfNotExists: false
});

let inventario = {};

const productos = {
    'armas': ['vintage', 'glock', 'beretta', 'ak47', 'uzi'],
    'cargadores': ['cargador pistolas', 'cargador subfusil'],
    'drogas': ['bongs', 'pcp', 'galletas', 'fentanilo', 'cocaina', 'marihuana'],
    'planos': ['supermercado', 'gasolinera', 'joyeria', 'barberia', 'licoreria', 'banco']
};

// Sistema de reconexión automática
async function reconnect() {
    if (isShuttingDown) return;
    
    const delay = Math.min(
        RECONNECT_CONFIG.reconnectDelay * Math.pow(RECONNECT_CONFIG.backoffMultiplier, reconnectAttempts),
        RECONNECT_CONFIG.maxReconnectDelay
    );
    
    console.log(`🔄 Reintentando conexión en ${delay/1000}s... (Intento ${reconnectAttempts + 1})`);
    
    setTimeout(async () => {
        if (isShuttingDown) return;
        
        try {
            if (client.readyTimestamp) {
                await client.destroy();
            }
            await client.login(DISCORD_TOKEN);
            reconnectAttempts = 0;
        } catch (error) {
            console.error('❌ Error en reconexión:', error.message);
            reconnectAttempts++;
            if (reconnectAttempts < RECONNECT_CONFIG.maxReconnects) {
                reconnect();
            }
        }
    }, delay);
}

// Manejo de eventos de conexión
client.on('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    client.user.setActivity('Inventario GTA RP 🔫', { type: ActivityType.Watching });
    reconnectAttempts = 0;
    await cargarInventario();
    await inicializarProductos();
});

client.on('disconnect', () => {
    console.log('⚠️ Bot desconectado');
    if (!isShuttingDown) reconnect();
});

client.on('error', (error) => {
    console.error('❌ Error:', error.message);
    if (!isShuttingDown) reconnect();
});

client.on('shardError', (error) => {
    console.error('❌ Shard error:', error.message);
    if (!isShuttingDown) reconnect();
});

// Funciones del inventario optimizadas
async function cargarInventario() {
    try {
        const data = await fs.readFile(INVENTARIO_FILE, 'utf8');
        inventario = JSON.parse(data);
        console.log('✅ Inventario cargado');
    } catch {
        inventario = {};
        await guardarInventario();
    }
}

async function guardarInventario() {
    try {
        await fs.writeFile(INVENTARIO_FILE, JSON.stringify(inventario, null, 2));
    } catch (error) {
        console.error('❌ Error guardando:', error.message);
    }
}

async function inicializarProductos() {
    if (Object.keys(inventario).length === 0) {
        ['glock', 'beretta', 'cargador pistolas', 'bongs', 'supermercado'].forEach(item => {
            inventario[item] = 0;
        });
        await guardarInventario();
    }
}

function crearEmbed(title, color = '#8b0000') {
    return new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
}

// Comandos optimizados
const comandos = {
    async ayuda(message) {
        const embed = crearEmbed('🔫 Comandos Bot GTA RP')
            .setDescription('**!agregar [item] [cant]** - Agrega items\n**!quitar [item] [cant]** - Quita items\n**!stock [item]** - Ver stock\n**!inventario** - Ver todo\n**!buscar [término]** - Buscar items\n**!categorias** - Ver categorías\n**!categoria [nombre]** - Items por categoría\n**!crear [item1,item2]** - Crear múltiples\n**!importar [categoría]** - Importar categoría\n**!limpiar** - Limpiar todo');
        await message.reply({ embeds: [embed] });
    },

    async agregar(message, args) {
        if (args.length < 2) return message.reply('❌ Uso: !agregar [item] [cantidad]');
        
        const cant = parseInt(args.pop());
        if (isNaN(cant) || cant <= 0) return message.reply('❌ Cantidad inválida');
        
        const item = args.join(' ').toLowerCase();
        inventario[item] = (inventario[item] || 0) + cant;
        await guardarInventario();
        
        const embed = crearEmbed('✅ Agregado', '#28a745')
            .addFields(
                { name: 'Item', value: item, inline: true },
                { name: 'Agregado', value: cant.toString(), inline: true },
                { name: 'Total', value: inventario[item].toString(), inline: true }
            );
        await message.reply({ embeds: [embed] });
    },

    async quitar(message, args) {
        if (args.length < 2) return message.reply('❌ Uso: !quitar [item] [cantidad]');
        
        const cant = parseInt(args.pop());
        if (isNaN(cant) || cant <= 0) return message.reply('❌ Cantidad inválida');
        
        const item = args.join(' ').toLowerCase();
        if (!inventario[item]) return message.reply('❌ Item no existe');
        if (inventario[item] < cant) return message.reply(`❌ Stock insuficiente: ${inventario[item]}`);
        
        inventario[item] -= cant;
        await guardarInventario();
        
        const embed = crearEmbed('📤 Retirado', '#dc3545')
            .addFields(
                { name: 'Item', value: item, inline: true },
                { name: 'Retirado', value: cant.toString(), inline: true },
                { name: 'Restante', value: inventario[item].toString(), inline: true }
            );
        await message.reply({ embeds: [embed] });
    },

    async stock(message, args) {
        if (!args.length) return message.reply('❌ Uso: !stock [item]');
        
        const item = args.join(' ').toLowerCase();
        if (!inventario.hasOwnProperty(item)) return message.reply('❌ Item no existe');
        
        const stock = inventario[item];
        const color = stock === 0 ? '#dc3545' : stock < 10 ? '#ffc107' : '#28a745';
        const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Bajo' : '🟢 Normal';
        
        const embed = crearEmbed('📊 Stock', color)
            .addFields(
                { name: 'Item', value: item, inline: true },
                { name: 'Cantidad', value: stock.toString(), inline: true },
                { name: 'Estado', value: estado, inline: true }
            );
        await message.reply({ embeds: [embed] });
    },

    async inventario(message) {
        const items = Object.keys(inventario);
        if (!items.length) return message.reply('📦 Inventario vacío');
        
        let desc = '';
        let totalItems = 0, totalUnidades = 0;
        
        items.sort().forEach(item => {
            const stock = inventario[item];
            const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
            desc += `${estado} **${item}**: ${stock}\n`;
            totalItems++;
            totalUnidades += stock;
        });
        
        const embed = crearEmbed('📋 Inventario', '#17a2b8')
            .setDescription(desc.slice(0, 4000))
            .addFields(
                { name: 'Total Items', value: totalItems.toString(), inline: true },
                { name: 'Total Unidades', value: totalUnidades.toString(), inline: true }
            );
        await message.reply({ embeds: [embed] });
    },

    async buscar(message, args) {
        if (!args.length) return message.reply('❌ Uso: !buscar [término]');
        
        const termino = args.join(' ').toLowerCase();
        const encontrados = Object.keys(inventario).filter(item => item.includes(termino));
        
        if (!encontrados.length) return message.reply(`❌ No encontrado: "${termino}"`);
        
        let desc = '';
        encontrados.forEach(item => {
            const stock = inventario[item];
            const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
            desc += `${estado} **${item}**: ${stock}\n`;
        });
        
        const embed = crearEmbed('🔍 Búsqueda', '#6f42c1').setDescription(desc);
        await message.reply({ embeds: [embed] });
    },

    async categorias(message) {
        const embed = crearEmbed('🗂️ Categorías');
        Object.keys(productos).forEach(cat => {
            const items = productos[cat];
            const emoji = { armas: '🔫', cargadores: '📦', drogas: '💊', planos: '🗺️' }[cat];
            embed.addFields({ 
                name: `${emoji} ${cat}`, 
                value: `${items.slice(0, 3).join(', ')}${items.length > 3 ? '...' : ''}`, 
                inline: true 
            });
        });
        await message.reply({ embeds: [embed] });
    },

    async categoria(message, args) {
        if (!args.length) return message.reply('❌ Uso: !categoria [nombre]');
        
        const cat = args.join(' ').toLowerCase();
        if (!productos[cat]) return message.reply('❌ Categoría no existe');
        
        let desc = '';
        productos[cat].forEach(item => {
            const tiene = inventario.hasOwnProperty(item);
            const stock = tiene ? inventario[item] : 0;
            const estado = tiene ? (stock > 0 ? '✅' : '⚪') : '➕';
            desc += `${estado} ${item}${tiene ? ` (${stock})` : ''}\n`;
        });
        
        const embed = crearEmbed(`🏷️ ${cat}`, '#ff6347').setDescription(desc);
        await message.reply({ embeds: [embed] });
    },

    async crear(message, args) {
        if (!args.length) return message.reply('❌ Uso: !crear [item1,item2,item3]');
        
        const items = args.join(' ').split(',').map(i => i.trim().toLowerCase()).filter(i => i);
        if (!items.length) return message.reply('❌ No hay items válidos');
        
        let nuevos = [], existentes = [];
        items.forEach(item => {
            if (!inventario.hasOwnProperty(item)) {
                inventario[item] = 0;
                nuevos.push(item);
            } else {
                existentes.push(item);
            }
        });
        
        await guardarInventario();
        
        let desc = '';
        if (nuevos.length) desc += `✅ **Creados:** ${nuevos.join(', ')}\n`;
        if (existentes.length) desc += `⚠️ **Ya existían:** ${existentes.join(', ')}`;
        
        const embed = crearEmbed('📦 Creación Lote', '#4169e1').setDescription(desc);
        await message.reply({ embeds: [embed] });
    },

    async importar(message, args) {
        if (!args.length) return message.reply('❌ Uso: !importar [categoría]');
        
        const cat = args.join(' ').toLowerCase();
        if (!productos[cat]) return message.reply('❌ Categoría no existe');
        
        let nuevos = [];
        productos[cat].forEach(item => {
            if (!inventario.hasOwnProperty(item)) {
                inventario[item] = 0;
                nuevos.push(item);
            }
        });
        
        await guardarInventario();
        
        const desc = nuevos.length ? 
            `✅ **Importados:** ${nuevos.join(', ')}` : 
            '✅ Todos ya existían';
        
        const embed = crearEmbed(`📥 Importar ${cat}`, '#ff8c00').setDescription(desc);
        await message.reply({ embeds: [embed] });
    },

    async limpiar(message) {
        const embed = crearEmbed('⚠️ Confirmar Limpieza', '#dc3545')
            .setDescription('Escribe `confirmar` para limpiar todo el inventario');
        await message.reply({ embeds: [embed] });
        
        const filter = r => r.author.id === message.author.id && ['confirmar', 'cancelar'].includes(r.content.toLowerCase());
        
        try {
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000 });
            if (collected.first().content.toLowerCase() === 'confirmar') {
                inventario = {};
                await guardarInventario();
                await message.reply('✅ Inventario limpiado');
            } else {
                await message.reply('❌ Cancelado');
            }
        } catch {
            await message.reply('⏰ Tiempo agotado');
        }
    }
};

// Manejo de mensajes
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    const aliases = {
        'help': 'ayuda', 'add': 'agregar', 'remove': 'quitar',
        'lista': 'inventario', 'search': 'buscar', 'clear': 'limpiar',
        'categories': 'categorias', 'category': 'categoria', 'create': 'crear', 'import': 'importar'
    };
    
    const comando = aliases[cmd] || cmd;
    
    if (comandos[comando]) {
        try {
            await comandos[comando](message, args);
        } catch (error) {
            console.error('❌ Error comando:', error.message);
            await message.reply('❌ Error procesando comando');
        }
    } else {
        await message.reply('❌ Comando no válido. Usa `!ayuda`');
    }
});

// Manejo de cierre elegante
process.on('SIGTERM', () => {
    console.log('🛑 Cerrando bot...');
    isShuttingDown = true;
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Cerrando bot...');
    isShuttingDown = true;
    client.destroy();
    process.exit(0);
});

// Validación y conexión
if (!DISCORD_TOKEN) {
    console.error('❌ ERROR: Token de Discord no configurado');
    console.error('🔗 Configura DISCORD_TOKEN en las variables de entorno');
    process.exit(1);
}

console.log('🚀 Iniciando bot con auto-reconexión...');
client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error inicial:', error.message);
    reconnectAttempts++;
    reconnect();
});
