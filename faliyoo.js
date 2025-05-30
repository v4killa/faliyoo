const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    restTimeOffset: 0
});

let inventario = {};
let sesionesActivas = new Map();

// Productos organizados
const productos = {
    'armas': { '🔫': 'glock', '🏹': 'vintage', '💣': 'beretta', '🪓': 'hachas', '🔪': 'machetes' },
    'cargadores': { '📦': 'cargador pistolas', '🗃️': 'cargador subfusil' },
    'drogas': { '🚬': 'bongs', '💊': 'pcp', '🍪': 'galletas', '💉': 'fentanilo', '❄️': 'cocaina', '🌿': 'marihuana' },
    'planos': { '🏪': 'supermercado', '⛽': 'gasolinera', '💎': 'joyeria', '💇': 'barberia', '🍺': 'licoreria', '➕': 'farmacia', '🛠️': 'arquitectinicos' }
};

const categoriaEmojis = { 'armas': '🔫', 'cargadores': '📦', 'drogas': '💊', 'planos': '🗺️' };

// --- FUNCIONES MONGODB CORREGIDAS ---
async function cargarInventario() {
    try {
        const productos = await inventarioCollection.find({}).toArray();
        inventario = {};
        productos.forEach(p => {
            // CORREGIDO: Validar tipos al cargar
            if (p.nombre && typeof p.nombre === 'string') {
                const cantidad = Number(p.cantidad);
                inventario[p.nombre] = isNaN(cantidad) ? 0 : cantidad;
            }
        });
        console.log('✅ Inventario cargado:', Object.keys(inventario).length, 'items');
    } catch (error) {
        console.error('❌ Error cargando inventario:', error.message);
        inventario = {};
    }
}

// FUNCIÓN CORREGIDA: Validación completa antes de guardar
async function guardarInventario() {
    try {
        // Validar datos antes de guardar
        const inventarioValidado = {};
        
        for (const [nombre, cantidad] of Object.entries(inventario)) {
            // Asegurar que nombre sea string y cantidad sea número
            if (typeof nombre === 'string' && nombre.trim() !== '') {
                const cantidadNum = Number(cantidad);
                if (!isNaN(cantidadNum) && cantidadNum >= 0) {
                    inventarioValidado[nombre.trim()] = cantidadNum;
                } else {
                    console.warn(`⚠️ Cantidad inválida para ${nombre}:`, cantidad);
                    inventarioValidado[nombre.trim()] = 0; // Valor por defecto
                }
            } else {
                console.warn(`⚠️ Nombre de producto inválido:`, nombre);
            }
        }
        
        const operaciones = Object.entries(inventarioValidado).map(([nombre, cantidad]) => ({
            updateOne: {
                filter: { nombre },
                update: { 
                    $set: { 
                        nombre: String(nombre), 
                        cantidad: Number(cantidad), 
                        ultimaActualizacion: new Date() 
                    } 
                },
                upsert: true
            }
        }));
        
        if (operaciones.length > 0) {
            await inventarioCollection.bulkWrite(operaciones);
            console.log(`✅ Guardado: ${operaciones.length} productos`);
        }
    } catch (error) {
        console.error('❌ Error guardando:', error.message);
        console.error('Stack completo:', error.stack);
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
            if (nombre.toLowerCase().trim() === nombreProducto.toLowerCase().trim()) return emoji;
        }
    }
    return '📦';
}

function crearBotones(botones) {
    const rows = [];
    for (let i = 0; i < botones.length; i += 5) {
        const row = new ActionRowBuilder();
        const chunk = botones.slice(i, i + 5);
        chunk.forEach(btn => row.addComponents(btn));
        rows.push(row);
    }
    return rows;
}

function codificarNombre(nombre) {
    return Buffer.from(nombre).toString('base64');
}

function decodificarNombre(nombreCodificado) {
    try {
        return Buffer.from(nombreCodificado, 'base64').toString('utf8');
    } catch {
        return nombreCodificado.replace(/_/g, ' ');
    }
}

// --- PANTALLAS CON BOTONES ---
async function mostrarHome(interaction, editar = false) {
    const embed = crearEmbed('🎮 Inventario GTA RP', '#4169e1')
        .setDescription(`**Selecciona una categoría para gestionar:**\n\n🔫 **Armas** - Pistolas y armamento\n📦 **Cargadores** - Munición\n💊 **Drogas** - Sustancias\n🗺️ **Planos** - Mapas de locaciones\n\n📊 **Ver stock completo**`);

    const botones = [
        new ButtonBuilder().setCustomId('cat_armas').setLabel('Armas').setEmoji('🔫').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cat_cargadores').setLabel('Cargadores').setEmoji('📦').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cat_drogas').setLabel('Drogas').setEmoji('💊').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('cat_planos').setLabel('Planos').setEmoji('🗺️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('stock_completo').setLabel('Stock Completo').setEmoji('📊').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    
    if (editar) {
        await interaction.update({ embeds: [embed], components: rows });
    } else {
        const response = await interaction.reply({ embeds: [embed], components: rows });
        sesionesActivas.set(interaction.user.id, { messageId: response.id, estado: 'home' });
    }
}

async function mostrarCategoria(interaction, categoria) {
    const productosCategoria = productos[categoria];
    if (!productosCategoria) {
        await interaction.reply({ content: '❌ Categoría no encontrada', ephemeral: true });
        return;
    }
    
    const nombreCat = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    const emojiCat = categoriaEmojis[categoria];
    
    let descripcion = `**Productos disponibles:**\n\n`;
    for (const [emoji, producto] of Object.entries(productosCategoria)) {
        const stock = Number(inventario[producto]) || 0;
        const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${estado} ${emoji} **${producto}** - Stock: **${stock}**\n`;
    }
    descripcion += `\n**Selecciona un producto para gestionar:**`;

    const embed = crearEmbed(`${emojiCat} ${nombreCat}`, '#28a745').setDescription(descripcion);

    const botones = Object.entries(productosCategoria).map(([emoji, producto]) => 
        new ButtonBuilder()
            .setCustomId(`prod_${codificarNombre(producto)}`)
            .setLabel(producto)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Success)
    );

    botones.push(new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary));

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
    
    sesionesActivas.set(interaction.user.id, { 
        messageId: interaction.message.id, 
        estado: 'categoria', 
        categoria: categoria 
    });
}

async function mostrarProducto(interaction, producto) {
    let categoriaProducto = null;
    for (const [catNombre, catProductos] of Object.entries(productos)) {
        if (Object.values(catProductos).includes(producto)) {
            categoriaProducto = catNombre;
            break;
        }
    }
    
    const emoji = obtenerEmojiProducto(producto);
    const stock = Number(inventario[producto]) || 0;
    const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Stock Bajo' : '🟢 Stock Normal';
    
    const embed = crearEmbed(`${emoji} ${producto.toUpperCase()}`, '#ffc107')
        .setDescription(`**Stock actual: ${stock}** ${estado}\n\n**¿Qué operación deseas realizar?**\n\n➕ **Agregar** - Aumentar stock\n➖ **Retirar** - Reducir stock`);

    const botones = [
        new ButtonBuilder().setCustomId(`op_add_${codificarNombre(producto)}`).setLabel('Agregar Stock').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`op_remove_${codificarNombre(producto)}`).setLabel('Retirar Stock').setEmoji('➖').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
    
    sesionesActivas.set(interaction.user.id, { 
        messageId: interaction.message.id, 
        estado: 'producto', 
        producto: producto,
        categoria: categoriaProducto
    });
}

async function mostrarCantidades(interaction, operacion, producto) {
    const todosProductos = Object.values(productos).flatMap(cat => Object.values(cat));
    if (!todosProductos.includes(producto)) {
        await interaction.reply({ content: '❌ Producto no encontrado', ephemeral: true });
        return;
    }
    
    const emoji = obtenerEmojiProducto(producto);
    const stock = Number(inventario[producto]) || 0;
    const titulo = operacion === 'add' ? 'Agregar Stock' : 'Retirar Stock';
    const color = operacion === 'add' ? '#28a745' : '#dc3545';
    
    const embed = crearEmbed(`${emoji} ${titulo}`, color)
        .setDescription(`**Producto:** ${producto}\n**Stock actual:** ${stock}\n\n**Selecciona la cantidad:**`);

    const productoCode = codificarNombre(producto);
    const botones = [
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_1`).setLabel('1').setEmoji('1️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_2`).setLabel('2').setEmoji('2️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_3`).setLabel('3').setEmoji('3️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_5`).setLabel('5').setEmoji('5️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_10`).setLabel('10').setEmoji('🔟').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_25`).setLabel('25').setEmoji('🔥').setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${productoCode}_50`).setLabel('50').setEmoji('💥').setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId('back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
    
    const sesion = sesionesActivas.get(interaction.user.id) || {};
    sesionesActivas.set(interaction.user.id, { 
        messageId: interaction.message.id, 
        estado: 'cantidad', 
        producto: producto,
        operacion: operacion,
        categoria: sesion.categoria
    });
}

// FUNCIÓN CORREGIDA: Con todas las validaciones implementadas
async function procesarOperacion(interaction, operacion, producto, cantidad) {
    const emoji = obtenerEmojiProducto(producto);
    let resultado, color;
    
    // VALIDACIONES AGREGADAS:
    
    // 1. Validar que cantidad sea un número válido
    if (typeof cantidad !== 'number' || isNaN(cantidad) || cantidad <= 0) {
        await interaction.reply({ 
            content: `❌ Error: Cantidad inválida (${cantidad}). Debe ser un número positivo.`, 
            ephemeral: true 
        });
        return;
    }
    
    // 2. Validar que el producto exista
    const todosProductos = Object.values(productos).flatMap(cat => Object.values(cat));
    if (!todosProductos.includes(producto)) {
        await interaction.reply({ 
            content: `❌ Error: Producto no encontrado (${producto})`, 
            ephemeral: true 
        });
        return;
    }
    
    // 3. Inicializar inventario del producto si no existe
    if (!(producto in inventario)) {
        inventario[producto] = 0;
    }
    
    if (operacion === 'add') {
        // CORREGIDO: Asegurar que ambos valores sean números
        const stockActual = Number(inventario[producto]) || 0;
        const cantidadAgregar = Number(cantidad);
        
        inventario[producto] = stockActual + cantidadAgregar;
        resultado = `✅ **OPERACIÓN EXITOSA**\n\n${emoji} **${producto}**\n➕ **Agregado:** ${cantidadAgregar} unidades\n📊 **Nuevo stock:** ${inventario[producto]}`;
        color = '#28a745';
        await guardarInventario();
    } else {
        // CORREGIDO: Conversión explícita a números
        const stockActual = Number(inventario[producto]) || 0;
        const cantidadRetirar = Number(cantidad);
        
        if (stockActual < cantidadRetirar) {
            resultado = `❌ **STOCK INSUFICIENTE**\n\n${emoji} **${producto}**\n📊 **Stock disponible:** ${stockActual}\n🚫 **Cantidad solicitada:** ${cantidadRetirar}`;
            color = '#dc3545';
        } else {
            inventario[producto] = stockActual - cantidadRetirar;
            resultado = `📤 **OPERACIÓN EXITOSA**\n\n${emoji} **${producto}**\n➖ **Retirado:** ${cantidadRetirar} unidades\n📊 **Stock restante:** ${inventario[producto]}`;
            color = '#dc3545';
            await guardarInventario();
        }
    }
    
    const embed = crearEmbed('⚡ Resultado de Operación', color).setDescription(resultado);

    const botones = [
        new ButtonBuilder().setCustomId(`prod_${codificarNombre(producto)}`).setLabel('Gestionar Producto').setEmoji('🔄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
}

async function mostrarStockCompleto(interaction) {
    let descripcion = '';
    for (const [catNombre, catProductos] of Object.entries(productos)) {
        const emojiCat = categoriaEmojis[catNombre];
        descripcion += `\n**${emojiCat} ${catNombre.toUpperCase()}:**\n`;
        for (const [emoji, producto] of Object.entries(catProductos)) {
            const stock = Number(inventario[producto]) || 0;
            const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
            descripcion += `${estado} ${emoji} ${producto}: **${stock}**\n`;
        }
    }
    
    const embed = crearEmbed('📊 Stock Completo', '#17a2b8').setDescription(descripcion);
    
    const botones = [
        new ButtonBuilder().setCustomId('home').setLabel('Volver al Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
}

// MANEJADOR DE INTERACCIONES CORREGIDO
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    
    try {
        if (customId === 'home') {
            await mostrarHome(interaction, true);
        }
        else if (customId === 'back') {
            const sesion = sesionesActivas.get(interaction.user.id);
            if (!sesion) {
                await mostrarHome(interaction, true);
                return;
            }
            
            if (sesion.estado === 'categoria') {
                await mostrarHome(interaction, true);
            } else if (sesion.estado === 'producto' && sesion.categoria) {
                await mostrarCategoria(interaction, sesion.categoria);
            } else if (sesion.estado === 'cantidad' && sesion.producto) {
                await mostrarProducto(interaction, sesion.producto);
            } else {
                await mostrarHome(interaction, true);
            }
        }
        else if (customId === 'stock_completo') {
            await mostrarStockCompleto(interaction);
        }
        else if (customId.startsWith('cat_')) {
            const categoria = customId.replace('cat_', '');
            await mostrarCategoria(interaction, categoria);
        }
        else if (customId.startsWith('prod_')) {
            const productoEncoded = customId.replace('prod_', '');
            const producto = decodificarNombre(productoEncoded);
            await mostrarProducto(interaction, producto);
        }
        else if (customId.startsWith('op_')) {
            const parts = customId.split('_');
            const operacion = parts[1];
            const productoEncoded = parts[2];
            const producto = decodificarNombre(productoEncoded);
            await mostrarCantidades(interaction, operacion, producto);
        }
        else if (customId.startsWith('qty_')) {
            const parts = customId.split('_');
            if (parts.length < 4) {
                await interaction.reply({ content: '❌ Formato de botón inválido', ephemeral: true });
                return;
            }
            
            const operacion = parts[1];
            const productoEncoded = parts[2];
            const cantidadStr = parts[3];
            
            // VALIDACIÓN MEJORADA
            const cantidad = parseInt(cantidadStr, 10);
            const producto = decodificarNombre(productoEncoded);
            
            console.log('Debug operación:', { operacion, producto, cantidadStr, cantidad }); // Para debugging
            
            if (isNaN(cantidad) || cantidad <= 0) {
                await interaction.reply({ 
                    content: `❌ Cantidad inválida: "${cantidadStr}" -> ${cantidad}`, 
                    ephemeral: true 
                });
                return;
            }
            
            if (!producto || producto.trim() === '') {
                await interaction.reply({ 
                    content: '❌ Producto no válido', 
                    ephemeral: true 
                });
                return;
            }
            
            await procesarOperacion(interaction, operacion, producto, cantidad);
        }

    } catch (error) {
        console.error('❌ Error en interacción:', error);
        console.error('CustomId:', customId);
        console.error('Stack:', error.stack); // Más información para debugging
        
        // Respuesta de error más informativa
        const errorMsg = `❌ Error procesando operación: ${error.message}`;
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMsg, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMsg, ephemeral: true });
            }
        } catch (replyError) {
            console.error('❌ Error enviando respuesta de error:', replyError);
        }
    }
});

// --- COMANDOS DE TEXTO ---
const comandos = {
    async inventario(message) {
        const embed = crearEmbed('🎮 Inventario GTA RP', '#4169e1')
            .setDescription(`**Selecciona una categoría para gestionar:**\n\n🔫 **Armas** - Pistolas y armamento\n📦 **Cargadores** - Munición\n💊 **Drogas** - Sustancias\n🗺️ **Planos** - Mapas de locaciones\n\n📊 **Ver stock completo**`);

        const botones = [
            new ButtonBuilder().setCustomId('cat_armas').setLabel('Armas').setEmoji('🔫').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cat_cargadores').setLabel('Cargadores').setEmoji('📦').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cat_drogas').setLabel('Drogas').setEmoji('💊').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('cat_planos').setLabel('Planos').setEmoji('🗺️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stock_completo').setLabel('Stock Completo').setEmoji('📊').setStyle(ButtonStyle.Secondary)
        ];

        const rows = crearBotones(botones);
        const response = await message.reply({ embeds: [embed], components: rows });
        sesionesActivas.set(message.author.id, { messageId: response.id, estado: 'home' });
    },
    
    async stock(message, args) {
        if (args.length === 0) {
            let descripcion = '**📊 STOCK RÁPIDO:**\n\n';
            for (const [catNombre, catProductos] of Object.entries(productos)) {
                for (const [emoji, producto] of Object.entries(catProductos)) {
                    const stock = Number(inventario[producto]) || 0;
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
                const stock = Number(inventario[producto]) || 0;
                const emoji = obtenerEmojiProducto(producto);
                const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
                descripcion += `${estado}${emoji} **${producto}**: ${stock}\n`;
            }
            
            await message.reply({ embeds: [crearEmbed('📋 Encontrado', '#28a745').setDescription(descripcion)] });
        }
    },

    async ayuda(message) {
        const embed = crearEmbed('🔫 Guía del Bot')
            .setDescription(`**COMANDOS:**\n• \`!inventario\` - Abrir interfaz interactiva\n• \`!stock [producto]\` - Buscar/Ver stock\n• \`!ayuda\` - Esta guía\n\n**USO:**\n🖱️ **Clickea los botones** para navegar\n✅ **Interfaz intuitiva** con botones\n⚡ **Operaciones rápidas** (1-50 unidades)\n\n**ESTADOS:**\n🟢 Stock Normal | 🟡 Stock Bajo | 🔴 Agotado`);
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

// --- EVENTOS Y CONFIGURACIÓN ---
client.on('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    client.user.setActivity('Inventario GTA RP 🔫', { type: ActivityType.Watching });
    await cargarInventario();
    await inicializarProductos();
});

client.on('error', error => console.error('❌ Error:', error.message));

setInterval(async () => await guardarInventario(), 30000);
setInterval(() => {
    const now = Date.now();
    for (const [userId, sesion] of sesionesActivas.entries()) {
        if (now - (sesion.timestamp || now) > 30 * 60 * 1000) {
            sesionesActivas.delete(userId);
        }
    }
}, 5 * 60 * 1000);

['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, async () => {
        console.log('🛑 Cerrando bot...');
        await guardarInventario();
        client.destroy();
        process.exit(0);
    });
});

if (!DISCORD_TOKEN || !MONGODB_URI) {
    console.error('❌ Token Discord o URI MongoDB no configurados');
    process.exit(1);
}

console.log('🚀 Iniciando bot con botones interactivos...');
conectarMongoDB().then(() => {
    client.login(DISCORD_TOKEN);
});
