const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const { MongoClient } = require('mongodb');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

// Configuración MongoDB
let db, inventarioCollection;

async function conectarMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('inventario_gta');
        inventarioCollection = db.collection('productos');
        console.log('✅ MongoDB Atlas conectado');
        await inventarioCollection.createIndex({ nombre: 1 });
    } catch (error) {
        console.error('❌ Error conectando MongoDB:', error.message);
        process.exit(1);
    }
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions],
    restTimeOffset: 0
});

let inventario = {};
let mensajesActivos = new Map();

// Productos organizados
const productos = {
    'armas': { '🔫': 'glock', '🏹': 'vintage', '💣': 'beretta', '🪓': 'hachas', '🔪': 'machetes' },
    'cargadores': { '📦': 'cargador pistolas', '🗃️': 'cargador subfusil' },
    'drogas': { '𖠞': 'bongs', '💊': 'pcp', '🍪': 'galletas', '💉': 'fentanilo', '❄️': 'cocaina', '🌿': 'marihuana' },
    'planos': { '🏪': 'supermercado', '⛽': 'gasolinera', '💎': 'joyeria', '💇': 'barberia', '🍺': 'licoreria', '➕': 'farmacia', '🛠️': 'arquitectinicos' }
};

// Controles unificados
const controles = {
    categorias: { '🔫': 'armas', '📦': 'cargadores', '💊': 'drogas', '🗺️': 'planos' },
    operaciones: { '➕': 'add', '➖': 'remove' },
    cantidades: { '1️⃣': 1, '2️⃣': 2, '3️⃣': 3, '4️⃣': 4, '5️⃣': 5, '🔥': 25, '💥': 50 },
    navegacion: { '⬅️': 'back', '🏠': 'home', '📊': 'stock', '🔄': 'refresh' }
};

const estados = { HOME: 'home', CATEGORIA: 'categoria', PRODUCTO: 'producto', OPERANDO: 'operando' };

// Funciones MongoDB optimizadas
async function cargarInventario() {
    try {
        const productos = await inventarioCollection.find({}).toArray();
        inventario = {};
        productos.forEach(p => inventario[p.nombre] = p.cantidad);
        console.log('✅ Inventario cargado:', Object.keys(inventario).length, 'items');
    } catch (error) {
        console.error('❌ Error cargando inventario:', error.message);
        inventario = {};
    }
}

async function guardarInventario() {
    try {
        const operaciones = Object.entries(inventario).map(([nombre, cantidad]) => ({
            updateOne: {
                filter: { nombre },
                update: { $set: { nombre, cantidad, ultimaActualizacion: new Date() } },
                upsert: true
            }
        }));
        if (operaciones.length > 0) {
            await inventarioCollection.bulkWrite(operaciones);
            console.log('💾 Guardado en MongoDB');
        }
    } catch (error) {
        console.error('❌ Error guardando:', error.message);
    }
}

async function inicializarProductos() {
    const todosProductos = Object.values(productos).flatMap(cat => Object.values(cat));
    let inicializado = false;
    for (const producto of todosProductos) {
        if (!(producto in inventario)) {
            inventario[producto] = 0;
            inicializado = true;
        }
    }
    if (inicializado) await guardarInventario();
}

// Utilidades
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
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } catch (error) {
        console.error('❌ Error reacciones:', error.message);
    }
}

// Pantallas interactivas optimizadas
async function mostrarHome(message) {
    const embed = crearEmbed('🎮 Inventario GTA RP', '#4169e1')
        .setDescription(`**Selecciona categoría:**\n\n🔫 **Armas** • 📦 **Cargadores**\n💊 **Drogas** • 🗺️ **Planos**\n\n📊 Stock completo • 🔄 Actualizar`);

    const newMessage = await message.reply({ embeds: [embed] });
    mensajesActivos.set(newMessage.id, { estado: estados.HOME, usuario: message.author.id, timestamp: Date.now() });
    await agregarReacciones(newMessage, ['🔫', '📦', '💊', '🗺️', '📊', '🔄']);
    return newMessage;
}

async function mostrarCategoria(message, categoria) {
    const productosCategoria = productos[categoria];
    const nombreCat = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    
    let descripcion = `**Productos disponibles:**\n\n`;
    for (const [emoji, producto] of Object.entries(productosCategoria)) {
        const stock = inventario[producto] || 0;
        const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${estado} ${emoji} **${producto}** (${stock})\n`;
    }
    descripcion += `\n**Clickea un producto para gestionar**`;

    const embed = crearEmbed(`${controles.categorias[Object.keys(controles.categorias).find(k => controles.categorias[k] === categoria)]} ${nombreCat}`, '#28a745')
        .setDescription(descripcion);

    const editedMessage = await message.edit({ embeds: [embed] });
    await editedMessage.reactions.removeAll();
    
    mensajesActivos.set(editedMessage.id, { 
        estado: estados.CATEGORIA, 
        categoria: categoria, 
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        timestamp: Date.now()
    });

    const emojisProductos = Object.keys(productosCategoria);
    await agregarReacciones(editedMessage, [...emojisProductos, '⬅️', '🏠']);
}

async function mostrarProducto(message, producto) {
    const emoji = obtenerEmojiProducto(producto);
    const stock = inventario[producto] || 0;
    const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Stock Bajo' : '🟢 Stock Normal';
    
    const embed = crearEmbed(`${emoji} ${producto.toUpperCase()}`, '#ffc107')
        .setDescription(`**Stock actual: ${stock}** ${estado}\n\n**Operaciones:**\n➕ Agregar stock\n➖ Retirar stock\n\n**Cantidades rápidas:**\n1️⃣-5️⃣ (1-5) • 🔥 (25) • 💥 (50)\n\n**Navegación:** ⬅️ Volver • 🏠 Inicio`);

    const editedMessage = await message.edit({ embeds: [embed] });
    await editedMessage.reactions.removeAll();
    
    mensajesActivos.set(editedMessage.id, { 
        estado: estados.PRODUCTO, 
        producto: producto, 
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        timestamp: Date.now()
    });

    await agregarReacciones(editedMessage, ['➕', '➖', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '🔥', '💥', '⬅️', '🏠']);
}

async function procesarOperacion(message, producto, operacion, cantidad) {
    const emoji = obtenerEmojiProducto(producto);
    let resultado, color;
    
    if (operacion === 'add') {
        inventario[producto] = (inventario[producto] || 0) + cantidad;
        resultado = `✅ **AGREGADO**\n${emoji} **${producto}**\n➕ +${cantidad} → **${inventario[producto]}** total`;
        color = '#28a745';
        await guardarInventario();
    } else {
        const stockActual = inventario[producto] || 0;
        if (stockActual < cantidad) {
            resultado = `❌ **STOCK INSUFICIENTE**\n${emoji} **${producto}**\nDisponible: **${stockActual}** | Solicitado: **${cantidad}**`;
            color = '#dc3545';
        } else {
            inventario[producto] -= cantidad;
            resultado = `📤 **RETIRADO**\n${emoji} **${producto}**\n➖ -${cantidad} → **${inventario[producto]}** restante`;
            color = '#dc3545';
            await guardarInventario();
        }
    }
    
    const embed = crearEmbed('⚡ Operación Completada', color)
        .setDescription(`${resultado}\n\n🔄 Otra operación • ⬅️ Volver • 🏠 Inicio`);

    const editedMessage = await message.edit({ embeds: [embed] });
    await editedMessage.reactions.removeAll();
    
    mensajesActivos.set(editedMessage.id, { 
        estado: estados.PRODUCTO, 
        producto: producto,
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        timestamp: Date.now()
    });

    await agregarReacciones(editedMessage, ['🔄', '⬅️', '🏠']);
}

async function mostrarStockCompleto(message) {
    let descripcion = '';
    for (const [catNombre, catProductos] of Object.entries(productos)) {
        const emojiCat = Object.keys(controles.categorias).find(k => controles.categorias[k] === catNombre);
        descripcion += `\n**${emojiCat} ${catNombre.toUpperCase()}:**\n`;
        for (const [emoji, producto] of Object.entries(catProductos)) {
            const stock = inventario[producto] || 0;
            const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
            descripcion += `${estado}${emoji} ${producto}: **${stock}**\n`;
        }
    }
    
    const embed = crearEmbed('📊 Stock Completo', '#17a2b8')
        .setDescription(descripcion);
    
    const editedMessage = await message.edit({ embeds: [embed] });
    await editedMessage.reactions.removeAll();
    
    mensajesActivos.set(editedMessage.id, { 
        estado: estados.HOME, 
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        timestamp: Date.now()
    });

    await agregarReacciones(editedMessage, ['🏠', '🔄']);
}

// Manejo de reacciones optimizado
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

    // Navegación unificada
    if (emoji === '🏠') return await mostrarHome(message);
    if (emoji === '🔄') {
        await cargarInventario();
        if (sesion.estado === estados.HOME) return await mostrarHome(message);
        if (sesion.estado === estados.CATEGORIA) return await mostrarCategoria(message, sesion.categoria);
        if (sesion.estado === estados.PRODUCTO) return await mostrarProducto(message, sesion.producto);
    }
    if (emoji === '⬅️') {
        if (sesion.estado === estados.CATEGORIA) return await mostrarHome(message);
        if (sesion.estado === estados.PRODUCTO) {
            const categoria = Object.keys(productos).find(cat => 
                Object.values(productos[cat]).includes(sesion.producto)
            );
            return await mostrarCategoria(message, categoria);
        }
    }

    // Lógica por estado
    if (sesion.estado === estados.HOME) {
        if (controles.categorias[emoji]) await mostrarCategoria(message, controles.categorias[emoji]);
        if (emoji === '📊') await mostrarStockCompleto(message);
    }
    
    else if (sesion.estado === estados.CATEGORIA) {
        const productosCategoria = productos[sesion.categoria];
        if (productosCategoria[emoji]) await mostrarProducto(message, productosCategoria[emoji]);
    }
    
    else if (sesion.estado === estados.PRODUCTO) {
        if (controles.operaciones[emoji]) {
            mensajesActivos.set(message.id, { ...sesion, operacion: controles.operaciones[emoji], estado: estados.OPERANDO });
        }
        if (controles.cantidades[emoji] && sesion.operacion) {
            await procesarOperacion(message, sesion.producto, sesion.operacion, controles.cantidades[emoji]);
        }
    }
});

// Comandos de texto
const comandos = {
    async inventario(message) { await mostrarHome(message); },
    
    async stock(message, args) {
        if (args.length === 0) {
            let descripcion = '**📊 STOCK RÁPIDO:**\n\n';
            for (const [catNombre, catProductos] of Object.entries(productos)) {
                for (const [emoji, producto] of Object.entries(catProductos)) {
                    const stock = inventario[producto] || 0;
                    const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
                    descripcion += `${estado}${emoji} ${producto}: **${stock}**\n`;
                }
            }
            await message.reply({ embeds: [crearEmbed('📋 Stock Completo', '#17a2b8').setDescription(descripcion)] });
        } else {
            const termino = args.join(' ').toLowerCase();
            const todosProductos = Object.values(productos).flatMap(cat => Object.values(cat));
            const encontrados = todosProductos.filter(p => p.toLowerCase().includes(termino));
            
            if (encontrados.length === 0) {
                await message.reply({ embeds: [crearEmbed('❌ No encontrado', '#dc3545').setDescription(`Sin resultados para: **${termino}**`)] });
                return;
            }
            
            let descripcion = `**🔍 "${termino}":**\n\n`;
            for (const producto of encontrados) {
                const stock = inventario[producto] || 0;
                const emoji = obtenerEmojiProducto(producto);
                const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
                descripcion += `${estado}${emoji} **${producto}**: ${stock}\n`;
            }
            
            await message.reply({ embeds: [crearEmbed('📋 Encontrado', '#28a745').setDescription(descripcion)] });
        }
    },

    async ayuda(message) {
        const embed = crearEmbed('🔫 Guía Rápida')
            .setDescription(`**COMANDOS:**\n• \`!inventario\` - Interfaz interactiva\n• \`!stock [producto]\` - Buscar/Ver stock\n• \`!ayuda\` - Esta guía\n\n**NAVEGACIÓN:**\n🖱️ Clickea emojis para navegar\n➕➖ Agregar/Quitar stock\n🔥=25, 💥=50 unidades\n\n**ESTADOS:**\n🟢 Normal | 🟡 Bajo | 🔴 Agotado`);
        await message.reply({ embeds: [embed] });
    }
};

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();
    const aliases = { 'help': 'ayuda', 'inv': 'inventario', 'start': 'inventario', 's': 'stock' };
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

// Eventos del cliente
client.on('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    client.user.setActivity('Inventario GTA RP 🔫', { type: ActivityType.Watching });
    await cargarInventario();
    await inicializarProductos();
});

client.on('error', error => console.error('❌ Error:', error.message));

// Guardado automático y limpieza
setInterval(async () => await guardarInventario(), 30000);
setInterval(() => {
    const now = Date.now();
    for (const [messageId, sesion] of mensajesActivos.entries()) {
        if (now - sesion.timestamp > 30 * 60 * 1000) {
            mensajesActivos.delete(messageId);
        }
    }
}, 5 * 60 * 1000);

// Cierre elegante
['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, async () => {
        console.log('🛑 Cerrando bot...');
        await guardarInventario();
        client.destroy();
        process.exit(0);
    });
});

// Validación e inicio
if (!DISCORD_TOKEN || !MONGODB_URI) {
    console.error('❌ Token Discord o URI MongoDB no configurados');
    process.exit(1);
}

console.log('🚀 Iniciando bot...');
conectarMongoDB().then(() => {
    client.login(DISCORD_TOKEN);
});
