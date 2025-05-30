const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
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

// Productos con sus emoticonos
const productos = {
    'armas': {
        '🔫': 'glock',
        '🏹': 'vintage', 
        '💣': 'beretta',
        '⚔️': 'ak47',
        '🔪': 'uzi'
    },
    'cargadores': {
        '📦': 'cargador pistolas',
        '🗃️': 'cargador subfusil'
    },
    'drogas': {
        '🚬': 'bongs',
        '💊': 'pcp',
        '🍪': 'galletas',
        '⚗️': 'fentanilo',
        '❄️': 'cocaina',
        '🌿': 'marihuana'
    },
    'planos': {
        '🏪': 'supermercado',
        '⛽': 'gasolinera',
        '💎': 'joyeria',
        '💇': 'barberia',
        '🍺': 'licoreria',
        '🏦': 'banco'
    }
};

// Emoticonos de números
const numeroEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

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

// Funciones del inventario
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
        const todosProductos = Object.values(productos).flatMap(categoria => Object.values(categoria));
        todosProductos.forEach(item => {
            inventario[item] = 0;
        });
        await guardarInventario();
    }
}

function crearEmbed(title, color = '#8b0000') {
    return new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
}

// Crear botones de categorías
function crearBotonesCategorias() {
    const row = new ActionRowBuilder();
    const categorias = [
        { emoji: '🔫', label: 'Armas', customId: 'cat_armas' },
        { emoji: '📦', label: 'Cargadores', customId: 'cat_cargadores' },
        { emoji: '💊', label: 'Drogas', customId: 'cat_drogas' },
        { emoji: '🗺️', label: 'Planos', customId: 'cat_planos' }
    ];
    
    categorias.forEach(cat => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(cat.customId)
                .setLabel(cat.label)
                .setEmoji(cat.emoji)
                .setStyle(ButtonStyle.Primary)
        );
    });
    
    return [row];
}

// Crear botones de productos por categoría
function crearBotonesProductos(categoria) {
    const rows = [];
    const productosCategoria = productos[categoria];
    const emojis = Object.keys(productosCategoria);
    
    for (let i = 0; i < emojis.length; i += 5) {
        const row = new ActionRowBuilder();
        const chunk = emojis.slice(i, i + 5);
        
        chunk.forEach(emoji => {
            const producto = productosCategoria[emoji];
            const stock = inventario[producto] || 0;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`prod_${producto}`)
                    .setEmoji(emoji)
                    .setLabel(`${stock}`)
                    .setStyle(stock === 0 ? ButtonStyle.Danger : stock < 10 ? ButtonStyle.Secondary : ButtonStyle.Success)
            );
        });
        
        rows.push(row);
    }
    
    // Botón de volver
    const backRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('back_categories')
                .setLabel('← Volver')
                .setStyle(ButtonStyle.Secondary)
        );
    
    rows.push(backRow);
    return rows;
}

// Crear botones de operaciones (+/-)
function crearBotonesOperaciones(producto) {
    const rows = [];
    
    // Botones +/-
    const operacionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`op_${producto}_add`)
                .setEmoji('➕')
                .setLabel('Agregar')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`op_${producto}_remove`)
                .setEmoji('➖')
                .setLabel('Quitar')
                .setStyle(ButtonStyle.Danger)
        );
    
    rows.push(operacionRow);
    return rows;
}

// Crear botones de cantidades
function crearBotonesCantidades(producto, operacion) {
    const rows = [];
    
    // Números 1-5
    const row1 = new ActionRowBuilder();
    for (let i = 1; i <= 5; i++) {
        row1.addComponents(
            new ButtonBuilder()
                .setCustomId(`cant_${producto}_${operacion}_${i}`)
                .setEmoji(numeroEmojis[i])
                .setLabel(i.toString())
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    // Números 6-9
    const row2 = new ActionRowBuilder();
    for (let i = 6; i <= 9; i++) {
        row2.addComponents(
            new ButtonBuilder()
                .setCustomId(`cant_${producto}_${operacion}_${i}`)
                .setEmoji(numeroEmojis[i])
                .setLabel(i.toString())
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    // Cantidades especiales
    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`cant_${producto}_${operacion}_25`)
                .setEmoji('🔥')
                .setLabel('25')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`cant_${producto}_${operacion}_50`)
                .setEmoji('💥')
                .setLabel('50')
                .setStyle(ButtonStyle.Secondary)
        );
    
    // Botón de volver
    const backRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`back_prod_${producto}`)
                .setLabel('← Volver')
                .setStyle(ButtonStyle.Secondary)
        );
    
    rows.push(row1, row2, row3, backRow);
    return rows;
}

// Obtener emoji de producto
function obtenerEmojiProducto(nombreProducto) {
    for (const categoria of Object.values(productos)) {
        for (const [emoji, nombre] of Object.entries(categoria)) {
            if (nombre === nombreProducto) return emoji;
        }
    }
    return '📦';
}

// Comandos
const comandos = {
    async inventario(message) {
        const embed = crearEmbed('🎮 Inventario GTA RP', '#4169e1')
            .setDescription('Selecciona una categoría para ver los productos:');
        
        const components = crearBotonesCategorias();
        await message.reply({ embeds: [embed], components });
    },

    async ayuda(message) {
        const embed = crearEmbed('🔫 Bot Inventario GTA RP')
            .setDescription('**Comandos disponibles:**\n\n**!inventario** - Abrir interfaz interactiva\n**!stock** - Ver resumen del inventario\n**!ayuda** - Ver esta ayuda\n\n*Usa los botones para navegar y modificar el inventario*');
        await message.reply({ embeds: [embed] });
    },

    async stock(message) {
        const items = Object.keys(inventario);
        if (!items.length) return message.reply('📦 Inventario vacío');
        
        let desc = '';
        let totalItems = 0, totalUnidades = 0;
        
        // Agrupar por categorías
        for (const [catNombre, catProductos] of Object.entries(productos)) {
            const emoji = { armas: '🔫', cargadores: '📦', drogas: '💊', planos: '🗺️' }[catNombre];
            desc += `\n**${emoji} ${catNombre.toUpperCase()}**\n`;
            
            for (const producto of Object.values(catProductos)) {
                if (inventario.hasOwnProperty(producto)) {
                    const stock = inventario[producto];
                    const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
                    const emojiProd = obtenerEmojiProducto(producto);
                    desc += `${estado} ${emojiProd} ${producto}: **${stock}**\n`;
                    totalItems++;
                    totalUnidades += stock;
                }
            }
        }
        
        const embed = crearEmbed('📊 Resumen Inventario', '#17a2b8')
            .setDescription(desc.slice(0, 4000))
            .addFields(
                { name: 'Total Items', value: totalItems.toString(), inline: true },
                { name: 'Total Unidades', value: totalUnidades.toString(), inline: true }
            );
        await message.reply({ embeds: [embed] });
    }
};

// Manejo de interacciones
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;
    
    const customId = interaction.customId;
    
    try {
        // Categorías
        if (customId.startsWith('cat_')) {
            const categoria = customId.replace('cat_', '');
            const embed = crearEmbed(`${categoria.charAt(0).toUpperCase() + categoria.slice(1)} 🎯`, '#ff6347')
                .setDescription('Selecciona un producto para modificar:');
            
            const components = crearBotonesProductos(categoria);
            await interaction.update({ embeds: [embed], components });
        }
        
        // Volver a categorías
        else if (customId === 'back_categories') {
            const embed = crearEmbed('🎮 Inventario GTA RP', '#4169e1')
                .setDescription('Selecciona una categoría para ver los productos:');
            
            const components = crearBotonesCategorias();
            await interaction.update({ embeds: [embed], components });
        }
        
        // Productos
        else if (customId.startsWith('prod_')) {
            const producto = customId.replace('prod_', '');
            const emoji = obtenerEmojiProducto(producto);
            const stock = inventario[producto] || 0;
            
            const embed = crearEmbed(`${emoji} ${producto}`, '#6f42c1')
                .setDescription(`**Stock actual:** ${stock}\n\n¿Qué deseas hacer?`);
            
            const components = crearBotonesOperaciones(producto);
            await interaction.update({ embeds: [embed], components });
        }
        
        // Operaciones
        else if (customId.startsWith('op_')) {
            const parts = customId.split('_');
            const producto = parts[1];
            const operacion = parts[2];
            const emoji = obtenerEmojiProducto(producto);
            
            const accion = operacion === 'add' ? 'agregar' : 'quitar';
            const embed = crearEmbed(`${operacion === 'add' ? '➕' : '➖'} ${emoji} ${producto}`, operacion === 'add' ? '#28a745' : '#dc3545')
                .setDescription(`Selecciona la cantidad a ${accion}:`);
            
            const components = crearBotonesCantidades(producto, operacion);
            await interaction.update({ embeds: [embed], components });
        }
        
        // Cantidades
        else if (customId.startsWith('cant_')) {
            const parts = customId.split('_');
            const producto = parts[1];
            const operacion = parts[2];
            const cantidad = parseInt(parts[3]);
            const emoji = obtenerEmojiProducto(producto);
            
            let resultado = '';
            let color = '#28a745';
            
            if (operacion === 'add') {
                inventario[producto] = (inventario[producto] || 0) + cantidad;
                resultado = `✅ **Agregado** ${cantidad} ${emoji} ${producto}\n**Nuevo stock:** ${inventario[producto]}`;
            } else {
                const stockActual = inventario[producto] || 0;
                if (stockActual < cantidad) {
                    resultado = `❌ **Error:** Stock insuficiente\n**Stock actual:** ${stockActual}`;
                    color = '#dc3545';
                } else {
                    inventario[producto] -= cantidad;
                    resultado = `📤 **Retirado** ${cantidad} ${emoji} ${producto}\n**Stock restante:** ${inventario[producto]}`;
                    color = '#dc3545';
                    await guardarInventario();
                }
            }
            
            if (operacion === 'add' || inventario[producto] >= cantidad) {
                await guardarInventario();
            }
            
            const embed = crearEmbed(`${operacion === 'add' ? '➕' : '➖'} ${emoji} ${producto}`, color)
                .setDescription(resultado);
            
            const components = crearBotonesOperaciones(producto);
            await interaction.update({ embeds: [embed], components });
        }
        
        // Volver a producto
        else if (customId.startsWith('back_prod_')) {
            const producto = customId.replace('back_prod_', '');
            const emoji = obtenerEmojiProducto(producto);
            const stock = inventario[producto] || 0;
            
            const embed = crearEmbed(`${emoji} ${producto}`, '#6f42c1')
                .setDescription(`**Stock actual:** ${stock}\n\n¿Qué deseas hacer?`);
            
            const components = crearBotonesOperaciones(producto);
            await interaction.update({ embeds: [embed], components });
        }
        
    } catch (error) {
        console.error('❌ Error en interacción:', error.message);
        await interaction.reply({ content: '❌ Error procesando la acción', ephemeral: true });
    }
});

// Manejo de mensajes
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    const aliases = {
        'help': 'ayuda',
        'inv': 'inventario',
        'list': 'inventario'
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

console.log('🚀 Iniciando bot con interfaz de emoticonos...');
client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error inicial:', error.message);
    reconnectAttempts++;
    reconnect();
});
