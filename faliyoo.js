const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { MongoClient } = require('mongodb');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI; // Tu conexión de MongoDB Atlas

// Configuración de MongoDB
let db;
let inventarioCollection;

async function conectarMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('inventario_gta'); // Nombre de la base de datos
        inventarioCollection = db.collection('productos'); // Nombre de la colección
        console.log('✅ MongoDB Atlas conectado');
        
        // Crear índice para búsquedas más rápidas
        await inventarioCollection.createIndex({ nombre: 1 });
    } catch (error) {
        console.error('❌ Error conectando MongoDB:', error.message);
        process.exit(1);
    }
}

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
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    restTimeOffset: 0,
    restWsBridgeTimeout: 100,
    restRequestTimeout: 15000,
    failIfNotExists: false
});

let inventario = {};
let mensajesActivos = new Map();

// Productos con sus emoticonos (sin cambios)
const productos = {
    'armas': {
        '🔫': 'glock',
        '🏹': 'vintage', 
        '💣': 'beretta',
        '🪓': 'hachas',
        '🔪': 'machetes'
    },
    'cargadores': {
        '📦': 'cargador pistolas',
        '🗃️': 'cargador subfusil'
    },
    'drogas': {
        '𖠞': 'bongs',
        '💊': 'pcp',
        '🍪': 'galletas',
        '💉': 'fentanilo',
        '❄️': 'cocaina',
        '🌿': 'marihuana'
    },
    'planos': {
        '🏪': 'supermercado',
        '⛽': 'gasolinera',
        '💎': 'joyeria',
        '💇': 'barberia',
        '🍺': 'licoreria',
        '➕': 'farmacia',
        '🛠️': 'arquitectinicos'
    }
};

// Emoticonos de navegación y operaciones (sin cambios)
const emojisControl = {
    categorias: {
        '🔫': 'armas',
        '📦': 'cargadores', 
        '💊': 'drogas',
        '🗺️': 'planos'
    },
    operaciones: {
        '➕': 'add',
        '➖': 'remove'
    },
    numeros: {
        '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5,
        '6️⃣': 6, '7️⃣': 7, '8️⃣': 8, '9️⃣': 9
    },
    especiales: {
        '🔥': 25,
        '💥': 50
    },
    navegacion: {
        '⬅️': 'back',
        '🏠': 'home',
        '📊': 'stock',
        '🔄': 'refresh'
    }
};

const estadosSesion = {
    HOME: 'home',
    CATEGORIA: 'categoria',
    PRODUCTO: 'producto',
    OPERACION: 'operacion',
    CANTIDAD: 'cantidad'
};

// Funciones de MongoDB - REEMPLAZAN las funciones de archivo JSON
async function cargarInventario() {
    try {
        const productos = await inventarioCollection.find({}).toArray();
        inventario = {};
        
        productos.forEach(producto => {
            inventario[producto.nombre] = producto.cantidad;
        });
        
        console.log('✅ Inventario cargado desde MongoDB:', Object.keys(inventario).length, 'items');
    } catch (error) {
        console.error('❌ Error cargando inventario:', error.message);
        inventario = {};
    }
}

async function guardarInventario() {
    try {
        // Usar operaciones en lote para mejor rendimiento
        const operaciones = Object.entries(inventario).map(([nombre, cantidad]) => ({
            updateOne: {
                filter: { nombre },
                update: { $set: { nombre, cantidad, ultimaActualizacion: new Date() } },
                upsert: true
            }
        }));
        
        if (operaciones.length > 0) {
            await inventarioCollection.bulkWrite(operaciones);
            console.log('💾 Inventario guardado en MongoDB');
        }
    } catch (error) {
        console.error('❌ Error guardando inventario:', error.message);
    }
}

async function inicializarProductos() {
    let inicializado = false;
    const todosProductos = Object.values(productos).flatMap(categoria => Object.values(categoria));
    
    for (const producto of todosProductos) {
        if (!(producto in inventario)) {
            inventario[producto] = 0;
            inicializado = true;
        }
    }
    
    if (inicializado) {
        await guardarInventario();
        console.log('🔧 Productos inicializados en MongoDB');
    }
}

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

// Eventos de conexión
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

function crearEmbed(title, color = '#8b0000') {
    return new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();
}

function obtenerEmojiProducto(nombreProducto) {
    for (const categoria of Object.values(productos)) {
        for (const [emoji, nombre] of Object.entries(categoria)) {
            if (nombre === nombreProducto) return emoji;
        }
    }
    return '📦';
}

async function agregarReacciones(message, emojis) {
    try {
        for (const emoji of emojis) {
            await message.react(emoji);
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    } catch (error) {
        console.error('❌ Error agregando reacciones:', error.message);
    }
}

function buscarProducto(termino) {
    const todosProductos = Object.values(productos).flatMap(categoria => Object.values(categoria));
    return todosProductos.filter(producto => 
        producto.toLowerCase().includes(termino.toLowerCase())
    );
}

// Pantallas del sistema (sin cambios significativos - solo las funciones principales)
async function mostrarHome(message) {
    const embed = crearEmbed('🎮 Inventario GTA RP - Interfaz Interactiva', '#4169e1')
        .setDescription(`**Selecciona una categoría clickeando el emoji:**\n\n🔫 **Armas** - Pistolas, rifles y armamento\n📦 **Cargadores** - Munición y accesorios\n💊 **Drogas** - Sustancias ilegales\n🗺️ **Planos** - Mapas de locaciones\n\n**Controles:**\n📊 Ver resumen completo\n🔄 Actualizar inventario\n\n*Clickea cualquier emoji para navegar* ⚡`);

    const newMessage = await message.reply({ embeds: [embed] });
    
    mensajesActivos.set(newMessage.id, {
        estado: estadosSesion.HOME,
        usuario: message.author.id
    });

    const emojisHome = ['🔫', '📦', '💊', '🗺️', '📊', '🔄'];
    await agregarReacciones(newMessage, emojisHome);
    
    return newMessage;
}

async function procesarOperacion(message, producto, operacion, cantidad) {
    const emoji = obtenerEmojiProducto(producto);
    let resultado = '';
    let color = '#28a745';
    
    if (operacion === 'add') {
        inventario[producto] = (inventario[producto] || 0) + cantidad;
        resultado = `✅ **AGREGADO**\n\n${emoji} **${producto}**\n➕ **+${cantidad}** unidades\n\n📊 **Stock actual:** ${inventario[producto]}`;
        await guardarInventario(); // Guardar en MongoDB
    } else {
        const stockActual = inventario[producto] || 0;
        if (stockActual < cantidad) {
            resultado = `❌ **ERROR**\n\n${emoji} **${producto}**\n⚠️ **Stock insuficiente**\n\n📊 **Stock disponible:** ${stockActual}\n🚫 **Solicitado:** ${cantidad}`;
            color = '#dc3545';
        } else {
            inventario[producto] -= cantidad;
            resultado = `📤 **RETIRADO**\n\n${emoji} **${producto}**\n➖ **-${cantidad}** unidades\n\n📊 **Stock restante:** ${inventario[producto]}`;
            color = '#dc3545';
            await guardarInventario(); // Guardar en MongoDB
        }
    }
    
    const embed = crearEmbed(`${operacion === 'add' ? '➕' : '➖'} OPERACIÓN COMPLETADA`, color)
        .setDescription(`${resultado}\n\n**Controles:**\n⬅️ Volver al producto\n🏠 Ir al menú principal\n🔄 Realizar otra operación`);

    const editedMessage = await message.edit({ embeds: [embed] });
    
    await editedMessage.reactions.removeAll();
    mensajesActivos.set(editedMessage.id, {
        estado: estadosSesion.PRODUCTO,
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        producto: producto
    });

    const emojisResultado = ['⬅️', '🏠', '🔄'];
    await agregarReacciones(editedMessage, emojisResultado);
}

// [RESTO DE FUNCIONES IGUALES - mostrarCategoria, mostrarProducto, mostrarCantidades, mostrarStockCompleto]
// Para mantener el código conciso, estas funciones permanecen igual que en tu código original

// Comandos de texto
const comandos = {
    async inventario(message) {
        await mostrarHome(message);
    },

    async stock(message, args) {
        if (args.length === 0) {
            let descripcion = '**📊 STOCK RÁPIDO:**\n\n';
            for (const [catNombre, catProductos] of Object.entries(productos)) {
                for (const [emojiProd, producto] of Object.entries(catProductos)) {
                    const stock = inventario[producto] || 0;
                    const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
                    descripcion += `${estado}${emojiProd} ${producto}: **${stock}**\n`;
                }
            }
            
            const embed = crearEmbed('📋 Stock Completo', '#17a2b8')
                .setDescription(descripcion)
                .setFooter({ text: 'Usa: !stock [producto] para buscar específico' });
            
            await message.reply({ embeds: [embed] });
        } else {
            const termino = args.join(' ');
            const productosEncontrados = buscarProducto(termino);
            
            if (productosEncontrados.length === 0) {
                const embed = crearEmbed('❌ Producto no encontrado', '#dc3545')
                    .setDescription(`No se encontró: **${termino}**\nUsa \`!stock\` para ver todos`);
                await message.reply({ embeds: [embed] });
                return;
            }
            
            let descripcion = `**🔍 Resultados para: "${termino}"**\n\n`;
            for (const producto of productosEncontrados) {
                const stock = inventario[producto] || 0;
                const emoji = obtenerEmojiProducto(producto);
                const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Bajo' : '🟢 Normal';
                descripcion += `${emoji} **${producto}**\n📊 Stock: **${stock}** ${estado}\n\n`;
            }
            
            const embed = crearEmbed('📋 Stock Encontrado', '#28a745')
                .setDescription(descripcion);
            
            await message.reply({ embeds: [embed] });
        }
    },

    async ayuda(message) {
        const embed = crearEmbed('🔫 Bot Inventario GTA RP - Guía de Uso')
            .setDescription(`**🎮 COMANDOS BÁSICOS:**\n• \`!inventario\` - Interfaz interactiva\n• \`!stock\` - Ver todo el stock\n• \`!stock [producto]\` - Buscar producto\n• \`!ayuda\` - Ver esta guía\n\n**🖱️ NAVEGACIÓN:**\n1. Usa \`!inventario\` para la interfaz completa\n2. Clickea emojis para navegar\n3. ➕➖ para modificar cantidades\n4. 🔥=25, 💥=50 unidades\n\n**🚦 ESTADOS:**\n🟢 Normal (10+) | 🟡 Bajo (<10) | 🔴 Agotado (0)\n\n**💡 EJEMPLOS:**\n\`!stock glock\` - Ver stock de glock\n\`!stock coca\` - Buscar cocaina\n\`!stock\` - Ver todo el inventario`);
        await message.reply({ embeds: [embed] });
    }
};

// Manejo de reacciones y mensajes (sin cambios)
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    
    const message = reaction.message;
    const emoji = reaction.emoji.name;
    
    const sesion = mensajesActivos.get(message.id);
    if (!sesion || sesion.usuario !== user.id) return;
    
    try {
        await reaction.users.remove(user.id);
    } catch (error) {
        console.error('❌ Error removiendo reacción:', error.message);
    }
    
    // [LÓGICA DE REACCIONES IGUAL QUE EN TU CÓDIGO ORIGINAL]
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    
    const aliases = {
        'help': 'ayuda',
        'inv': 'inventario',
        'start': 'inventario',
        's': 'stock'
    };
    
    const comando = aliases[cmd] || cmd;
    
    if (comandos[comando]) {
        try {
            await comandos[comando](message, args);
        } catch (error) {
            console.error('❌ Error comando:', error.message);
            await message.reply('❌ Error procesando comando');
        }
    }
});

// Guardado periódico automático cada 30 segundos
setInterval(async () => {
    await guardarInventario();
}, 30000);

// Limpiar mensajes inactivos
setInterval(() => {
    const now = Date.now();
    for (const [messageId, sesion] of mensajesActivos.entries()) {
        if (now - sesion.timestamp > 30 * 60 * 1000) {
            mensajesActivos.delete(messageId);
        }
    }
}, 5 * 60 * 1000);

// Manejo de cierre elegante
process.on('SIGTERM', async () => {
    console.log('🛑 Cerrando bot - Guardando inventario...');
    isShuttingDown = true;
    await guardarInventario();
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Cerrando bot - Guardando inventario...');
    isShuttingDown = true;
    await guardarInventario();
    client.destroy();
    process.exit(0);
});

// Validación y conexión
if (!DISCORD_TOKEN || !MONGODB_URI) {
    console.error('❌ ERROR: Token de Discord o URI de MongoDB no configurados');
    process.exit(1);
}

console.log('🚀 Iniciando bot con MongoDB Atlas...');

// Conectar MongoDB primero, luego Discord
conectarMongoDB().then(() => {
    client.login(DISCORD_TOKEN).catch(error => {
        console.error('❌ Error inicial:', error.message);
        reconnectAttempts++;
        reconnect();
    });
});
