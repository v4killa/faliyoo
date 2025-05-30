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
let cambiosPendientes = false; // Para evitar guardados excesivos

// Productos con sus emoticonos
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

// Emoticonos de navegación y operaciones
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
    console.log('⚠️ Bot desconectado - Guardando inventario...');
    guardarInventarioSincronizado();
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

// Funciones del inventario mejoradas
async function cargarInventario() {
    try {
        const data = await fs.readFile(INVENTARIO_FILE, 'utf8');
        inventario = JSON.parse(data);
        console.log('✅ Inventario cargado:', Object.keys(inventario).length, 'items');
    } catch {
        console.log('⚠️ Creando nuevo inventario...');
        inventario = {};
        await guardarInventario();
    }
}

async function guardarInventario() {
    try {
        await fs.writeFile(INVENTARIO_FILE, JSON.stringify(inventario, null, 2));
        cambiosPendientes = false;
        console.log('💾 Inventario guardado');
    } catch (error) {
        console.error('❌ Error guardando:', error.message);
    }
}

// Guardado síncrono para desconexiones
function guardarInventarioSincronizado() {
    try {
        require('fs').writeFileSync(INVENTARIO_FILE, JSON.stringify(inventario, null, 2));
        console.log('💾 Inventario guardado (síncrono)');
    } catch (error) {
        console.error('❌ Error guardando síncrono:', error.message);
    }
}

async function inicializarProductos() {
    let inicializado = false;
    const todosProductos = Object.values(productos).flatMap(categoria => Object.values(categoria));
    
    todosProductos.forEach(item => {
        if (!(item in inventario)) {
            inventario[item] = 0;
            inicializado = true;
        }
    });
    
    if (inicializado) {
        await guardarInventario();
        console.log('🔧 Productos inicializados');
    }
}

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

// Función para buscar productos por nombre parcial
function buscarProducto(termino) {
    const todosProductos = Object.values(productos).flatMap(categoria => Object.values(categoria));
    return todosProductos.filter(producto => 
        producto.toLowerCase().includes(termino.toLowerCase())
    );
}

// Pantallas del sistema (sin cambios significativos)
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

async function mostrarCategoria(message, categoria) {
    const productosCategoria = productos[categoria];
    const emojiCategoria = Object.keys(emojisControl.categorias).find(k => emojisControl.categorias[k] === categoria);
    
    let descripcion = `**Productos disponibles:**\n\n`;
    const emojisReacciones = [];
    
    for (const [emoji, producto] of Object.entries(productosCategoria)) {
        const stock = inventario[producto] || 0;
        const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${emoji} **${producto}** ${estado} (${stock})\n`;
        emojisReacciones.push(emoji);
    }
    
    descripcion += `\n**Controles:**\n⬅️ Volver al menú principal`;
    
    const embed = crearEmbed(`${emojiCategoria} ${categoria.toUpperCase()}`, '#ff6347')
        .setDescription(descripcion);

    const editedMessage = await message.edit({ embeds: [embed] });
    
    await editedMessage.reactions.removeAll();
    mensajesActivos.set(editedMessage.id, {
        estado: estadosSesion.CATEGORIA,
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        categoria: categoria
    });

    emojisReacciones.push('⬅️');
    await agregarReacciones(editedMessage, emojisReacciones);
}

async function mostrarProducto(message, producto) {
    const emoji = obtenerEmojiProducto(producto);
    const stock = inventario[producto] || 0;
    const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Stock Bajo' : '🟢 Stock Normal';
    
    const embed = crearEmbed(`${emoji} ${producto.toUpperCase()}`, '#6f42c1')
        .setDescription(`**Stock actual:** ${stock}\n**Estado:** ${estado}\n\n**¿Qué deseas hacer?**\n➕ Agregar unidades\n➖ Quitar unidades\n\n**Controles:**\n⬅️ Volver a la categoría\n🏠 Ir al menú principal`);

    const editedMessage = await message.edit({ embeds: [embed] });
    
    await editedMessage.reactions.removeAll();
    mensajesActivos.set(editedMessage.id, {
        estado: estadosSesion.PRODUCTO,
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        producto: producto
    });

    const emojisOperaciones = ['➕', '➖', '⬅️', '🏠'];
    await agregarReacciones(editedMessage, emojisOperaciones);
}

async function mostrarCantidades(message, producto, operacion) {
    const emoji = obtenerEmojiProducto(producto);
    const accion = operacion === 'add' ? 'AGREGAR' : 'QUITAR';
    const color = operacion === 'add' ? '#28a745' : '#dc3545';
    
    const embed = crearEmbed(`${operacion === 'add' ? '➕' : '➖'} ${emoji} ${producto.toUpperCase()}`, color)
        .setDescription(`**Selecciona la cantidad a ${accion.toLowerCase()}:**\n\n**Cantidades individuales:**\n1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣\n6️⃣ 7️⃣ 8️⃣ 9️⃣\n\n**Cantidades especiales:**\n🔥 25 unidades\n💥 50 unidades\n\n**Controles:**\n⬅️ Volver al producto\n🏠 Ir al menú principal`);

    const editedMessage = await message.edit({ embeds: [embed] });
    
    await editedMessage.reactions.removeAll();
    mensajesActivos.set(editedMessage.id, {
        estado: estadosSesion.CANTIDAD,
        usuario: mensajesActivos.get(editedMessage.id).usuario,
        producto: producto,
        operacion: operacion
    });

    const emojisCantidades = [
        '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
        '6️⃣', '7️⃣', '8️⃣', '9️⃣',
        '🔥', '💥', '⬅️', '🏠'
    ];
    await agregarReacciones(editedMessage, emojisCantidades);
}

async function procesarOperacion(message, producto, operacion, cantidad) {
    const emoji = obtenerEmojiProducto(producto);
    let resultado = '';
    let color = '#28a745';
    
    if (operacion === 'add') {
        inventario[producto] = (inventario[producto] || 0) + cantidad;
        resultado = `✅ **AGREGADO**\n\n${emoji} **${producto}**\n➕ **+${cantidad}** unidades\n\n📊 **Stock actual:** ${inventario[producto]}`;
        cambiosPendientes = true;
        await guardarInventario(); // Guardar inmediatamente
    } else {
        const stockActual = inventario[producto] || 0;
        if (stockActual < cantidad) {
            resultado = `❌ **ERROR**\n\n${emoji} **${producto}**\n⚠️ **Stock insuficiente**\n\n📊 **Stock disponible:** ${stockActual}\n🚫 **Solicitado:** ${cantidad}`;
            color = '#dc3545';
        } else {
            inventario[producto] -= cantidad;
            resultado = `📤 **RETIRADO**\n\n${emoji} **${producto}**\n➖ **-${cantidad}** unidades\n\n📊 **Stock restante:** ${inventario[producto]}`;
            color = '#dc3545';
            cambiosPendientes = true;
            await guardarInventario(); // Guardar inmediatamente
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

async function mostrarStockCompleto(message) {
    let descripcion = '';
    let totalItems = 0, totalUnidades = 0;
    
    for (const [catNombre, catProductos] of Object.entries(productos)) {
        const emojiCat = Object.keys(emojisControl.categorias).find(k => emojisControl.categorias[k] === catNombre);
        descripcion += `\n**${emojiCat} ${catNombre.toUpperCase()}**\n`;
        
        for (const [emojiProd, producto] of Object.entries(catProductos)) {
            if (inventario.hasOwnProperty(producto)) {
                const stock = inventario[producto];
                const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
                descripcion += `${estado} ${emojiProd} ${producto}: **${stock}**\n`;
                totalItems++;
                totalUnidades += stock;
            }
        }
    }
    
    const embed = crearEmbed('📊 RESUMEN COMPLETO DEL INVENTARIO', '#17a2b8')
        .setDescription(`${descripcion}\n**📈 TOTALES:**\n🔢 **Items únicos:** ${totalItems}\n📦 **Unidades totales:** ${totalUnidades}\n\n**Controles:**\n🏠 Volver al menú principal`)
        .setFooter({ text: '🟢 Normal | 🟡 Bajo | 🔴 Agotado' });

    const editedMessage = await message.edit({ embeds: [embed] });
    
    await editedMessage.reactions.removeAll();
    mensajesActivos.set(editedMessage.id, {
        estado: estadosSesion.HOME,
        usuario: mensajesActivos.get(editedMessage.id).usuario
    });

    await agregarReacciones(editedMessage, ['🏠']);
}

// Comandos de texto mejorados
const comandos = {
    async inventario(message) {
        await mostrarHome(message);
    },

    async stock(message, args) {
        if (args.length === 0) {
            // Mostrar stock resumido
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
            // Buscar producto específico
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

// Manejo de reacciones (sin cambios)
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
    
    try {
        switch (sesion.estado) {
            case estadosSesion.HOME:
                if (emojisControl.categorias[emoji]) {
                    await mostrarCategoria(message, emojisControl.categorias[emoji]);
                } else if (emoji === '📊') {
                    await mostrarStockCompleto(message);
                } else if (emoji === '🔄') {
                    await mostrarHome(message);
                }
                break;
                
            case estadosSesion.CATEGORIA:
                if (emoji === '⬅️') {
                    await mostrarHome(message);
                } else if (productos[sesion.categoria] && productos[sesion.categoria][emoji]) {
                    await mostrarProducto(message, productos[sesion.categoria][emoji]);
                }
                break;
                
            case estadosSesion.PRODUCTO:
                if (emoji === '➕' || emoji === '➖') {
                    const operacion = emoji === '➕' ? 'add' : 'remove';
                    await mostrarCantidades(message, sesion.producto, operacion);
                } else if (emoji === '⬅️') {
                    let categoria = null;
                    for (const [cat, prods] of Object.entries(productos)) {
                        if (Object.values(prods).includes(sesion.producto)) {
                            categoria = cat;
                            break;
                        }
                    }
                    if (categoria) {
                        await mostrarCategoria(message, categoria);
                    }
                } else if (emoji === '🏠') {
                    await mostrarHome(message);
                } else if (emoji === '🔄') {
                    await mostrarProducto(message, sesion.producto);
                }
                break;
                
            case estadosSesion.CANTIDAD:
                let cantidad = null;
                if (emojisControl.numeros[emoji]) {
                    cantidad = emojisControl.numeros[emoji];
                } else if (emojisControl.especiales[emoji]) {
                    cantidad = emojisControl.especiales[emoji];
                } else if (emoji === '⬅️') {
                    await mostrarProducto(message, sesion.producto);
                    return;
                } else if (emoji === '🏠') {
                    await mostrarHome(message);
                    return;
                }
                
                if (cantidad !== null) {
                    await procesarOperacion(message, sesion.producto, sesion.operacion, cantidad);
                }
                break;
        }
    } catch (error) {
        console.error('❌ Error procesando reacción:', error.message);
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

// Guardado periódico automático
setInterval(async () => {
    if (cambiosPendientes) {
        await guardarInventario();
    }
}, 30000); // Cada 30 segundos si hay cambios

// Limpiar mensajes inactivos
setInterval(() => {
    const now = Date.now();
    for (const [messageId, sesion] of mensajesActivos.entries()) {
        if (now - sesion.timestamp > 30 * 60 * 1000) {
            mensajesActivos.delete(messageId);
        }
    }
}, 5 * 60 * 1000);

// Manejo de cierre elegante con guardado forzado
process.on('SIGTERM', async () => {
    console.log('🛑 Cerrando bot - Guardando inventario...');
    isShuttingDown = true;
    guardarInventarioSincronizado();
    client.destroy();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Cerrando bot - Guardando inventario...');
    isShuttingDown = true;
    guardarInventarioSincronizado();
    client.destroy();
    process.exit(0);
});

process.on('beforeExit', () => {
    console.log('💾 Guardado final del inventario...');
    guardarInventarioSincronizado();
});

// Validación y conexión
if (!DISCORD_TOKEN) {
    console.error('❌ ERROR: Token de Discord no configurado');
    process.exit(1);
}

console.log('🚀 Iniciando bot con guardado mejorado...');
client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error inicial:', error.message);
    reconnectAttempts++;
    reconnect();
});
