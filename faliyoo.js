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
    'drogas': { '𖠞': 'bongs', '💊': 'pcp', '🍪': 'galletas', '💉': 'fentanilo', '❄️': 'cocaina', '🌿': 'marihuana' },
    'planos': { '🏪': 'supermercado', '⛽': 'gasolinera', '💎': 'joyeria', '💇': 'barberia', '🍺': 'licoreria', '➕': 'farmacia', '🛠️': 'arquitectinicos' }
};

const categoriaEmojis = { 'armas': '🔫', 'cargadores': '📦', 'drogas': '💊', 'planos': '🗺️' };

// Funciones MongoDB
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

// Pantallas con botones
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
    const nombreCat = categoria.charAt(0).toUpperCase() + categoria.slice(1);
    const emojiCat = categoriaEmojis[categoria];
    
    let descripcion = `**Productos disponibles:**\n\n`;
    for (const [emoji, producto] of Object.entries(productosCategoria)) {
        const stock = inventario[producto] || 0;
        const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${estado} ${emoji} **${producto}** - Stock: **${stock}**\n`;
    }
    descripcion += `\n**Selecciona un producto para gestionar:**`;

    const embed = crearEmbed(`${emojiCat} ${nombreCat}`, '#28a745').setDescription(descripcion);

    const botones = Object.entries(productosCategoria).map(([emoji, producto]) => 
        new ButtonBuilder()
            .setCustomId(`prod_${producto}`)
            .setLabel(producto)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Success)
    );

    botones.push(
        new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    );

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
    
    sesionesActivas.set(interaction.user.id, { 
        messageId: interaction.message.id, 
        estado: 'categoria', 
        categoria: categoria 
    });
}

async function mostrarProducto(interaction, producto) {
    const emoji = obtenerEmojiProducto(producto);
    const stock = inventario[producto] || 0;
    const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Stock Bajo' : '🟢 Stock Normal';
    
    const embed = crearEmbed(`${emoji} ${producto.toUpperCase()}`, '#ffc107')
        .setDescription(`**Stock actual: ${stock}** ${estado}\n\n**¿Qué operación deseas realizar?**\n\n➕ **Agregar** - Aumentar stock\n➖ **Retirar** - Reducir stock`);

    const botones = [
        new ButtonBuilder().setCustomId(`op_add_${producto}`).setLabel('Agregar Stock').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`op_remove_${producto}`).setLabel('Retirar Stock').setEmoji('➖').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
    
    sesionesActivas.set(interaction.user.id, { 
        messageId: interaction.message.id, 
        estado: 'producto', 
        producto: producto 
    });
}

async function mostrarCantidades(interaction, operacion, producto) {
    const emoji = obtenerEmojiProducto(producto);
    const stock = inventario[producto] || 0;
    const titulo = operacion === 'add' ? 'Agregar Stock' : 'Retirar Stock';
    const color = operacion === 'add' ? '#28a745' : '#dc3545';
    
    const embed = crearEmbed(`${emoji} ${titulo}`, color)
        .setDescription(`**Producto:** ${producto}\n**Stock actual:** ${stock}\n\n**Selecciona la cantidad:**`);

    const botones = [
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_1`).setLabel('1').setEmoji('1️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_2`).setLabel('2').setEmoji('2️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_3`).setLabel('3').setEmoji('3️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_5`).setLabel('5').setEmoji('5️⃣').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_10`).setLabel('10').setEmoji('🔟').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_25`).setLabel('25').setEmoji('🔥').setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId(`qty_${operacion}_${producto}_50`).setLabel('50').setEmoji('💥').setStyle(ButtonStyle.Warning),
        new ButtonBuilder().setCustomId('back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
    ];

    const rows = crearBotones(botones);
    await interaction.update({ embeds: [embed], components: rows });
    
    sesionesActivas.set(interaction.user.id, { 
        messageId: interaction.message.id, 
        estado: 'cantidad', 
        producto: producto,
        operacion: operacion
    });
}

async function procesarOperacion(interaction, operacion, producto, cantidad) {
    const emoji = obtenerEmojiProducto(producto);
    let resultado, color;
    
    if (operacion === 'add') {
        inventario[producto] = (inventario[producto] || 0) + cantidad;
        resultado = `✅ **OPERACIÓN EXITOSA**\n\n${emoji} **${producto}**\n➕ **Agregado:** ${cantidad} unidades\n📊 **Nuevo stock:** ${inventario[producto]}`;
        color = '#28a745';
        await guardarInventario();
    } else {
        const stockActual = inventario[producto] || 0;
        if (stockActual < cantidad) {
            resultado = `❌ **STOCK INSUFICIENTE**\n\n${emoji} **${producto}**\n📊 **Stock disponible:** ${stockActual}\n🚫 **Cantidad solicitada:** ${cantidad}`;
            color = '#dc3545';
        } else {
            inventario[producto] -= cantidad;
            resultado = `📤 **OPERACIÓN EXITOSA**\n\n${emoji} **${producto}**\n➖ **Retirado:** ${cantidad} unidades\n📊 **Stock restante:** ${inventario[producto]}`;
            color = '#dc3545';
            await guardarInventario();
        }
    }
    
    const embed = crearEmbed('⚡ Resultado de Operación', color).setDescription(resultado);

    const botones = [
        new ButtonBuilder().setCustomId(`prod_${producto}`).setLabel('Gestionar Producto').setEmoji('🔄').setStyle(ButtonStyle.Primary),
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
            const stock = inventario[producto] || 0;
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

// Manejo de interacciones con botones
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    
    try {
        // Navegación principal
        if (customId === 'home') {
            await mostrarHome(interaction, true);
        }
        else if (customId === 'back') {
            const sesion = sesionesActivas.get(interaction.user.id);
            if (sesion?.estado === 'categoria') {
                await mostrarHome(interaction, true);
            } else if (sesion?.estado === 'producto') {
                await mostrarCategoria(interaction, sesion.categoria);
            } else if (sesion?.estado === 'cantidad') {
                await mostrarProducto(interaction, sesion.producto);
            }
        }
        else if (customId === 'stock_completo') {
            await mostrarStockCompleto(interaction);
        }
        
        // Categorías
        else if (customId.startsWith('cat_')) {
            const categoria = customId.replace('cat_', '');
            await mostrarCategoria(interaction, categoria);
        }
        
        // Productos
        else if (customId.startsWith('prod_')) {
            const producto = customId.replace('prod_', '');
            await mostrarProducto(interaction, producto);
        }
        
        // Operaciones
        else if (customId.startsWith('op_')) {
            const [, operacion, ...productoParts] = customId.split('_');
            const producto = productoParts.join('_');
            await mostrarCantidades(interaction, operacion, producto);
        }
        
        // Cantidades
        else if (customId.startsWith('qty_')) {
            const [, operacion, ...parts] = customId.split('_');
            const cantidad = parseInt(parts.pop());
            const producto = parts.join('_');
            await procesarOperacion(interaction, operacion, producto, cantidad);
        }

    } catch (error) {
        console.error('❌ Error en interacción:', error.message);
        await interaction.reply({ content: '❌ Error procesando operación', ephemeral: true });
    }
});

// Comandos de texto
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
    for (const [userId, sesion] of sesionesActivas.entries()) {
        if (now - (sesion.timestamp || now) > 30 * 60 * 1000) {
            sesionesActivas.delete(userId);
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

console.log('🚀 Iniciando bot con botones interactivos...');
conectarMongoDB().then(() => {
    client.login(DISCORD_TOKEN);
});
