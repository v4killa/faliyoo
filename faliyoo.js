const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs').promises;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const INVENTARIO_FILE = './inventario.json';

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let inventario = {};
const mensajesProcesados = new Set();

// Productos predefinidos
const productos = {
    'armas': ['vintage', 'glock', 'beretta', 'ak47', 'uzi'],
    'cargadores': ['cargador pistolas', 'cargador subfusil'],
    'drogas': ['bongs', 'pcp', 'galletas', 'fentanilo', 'cocaina', 'marihuana', 'heroina'],
    'planos': ['supermercado', 'gasolinera', 'joyeria', 'barberia', 'licoreria', 'tatuajes', 'banco']
};

// Función para cargar inventario
async function cargarInventario() {
    try {
        const data = await fs.readFile(INVENTARIO_FILE, 'utf8');
        inventario = JSON.parse(data);
        console.log('✅ Inventario cargado');
    } catch {
        inventario = {};
        await guardarInventario();
        console.log('📝 Nuevo inventario creado');
    }
}

// Función para guardar inventario
async function guardarInventario() {
    try {
        await fs.writeFile(INVENTARIO_FILE, JSON.stringify(inventario, null, 2));
        console.log('💾 Inventario guardado');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar:', error);
        return false;
    }
}

// Limpiar cache cada 5 minutos
setInterval(() => {
    if (mensajesProcesados.size > 50) {
        mensajesProcesados.clear();
        console.log('🧹 Cache limpiado');
    }
}, 5 * 60 * 1000);

// Comandos
async function ayuda(message) {
    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔫 Bot Inventario GTA RP')
        .addFields(
            { name: '!agregar [item] [cantidad]', value: 'Agrega items', inline: false },
            { name: '!quitar [item] [cantidad]', value: 'Quita items', inline: false },
            { name: '!stock [item]', value: 'Ver stock de un item', inline: false },
            { name: '!inventario', value: 'Ver todo el inventario', inline: false },
            { name: '!buscar [término]', value: 'Buscar items', inline: false },
            { name: '!categorias', value: 'Ver categorías disponibles', inline: false },
            { name: '!categoria [nombre]', value: 'Ver items de categoría', inline: false },
            { name: '!importar [categoría]', value: 'Importar categoría completa', inline: false },
            { name: '!guardar', value: 'Guardar inventario manualmente', inline: false },
            { name: '!limpiar', value: 'Limpiar inventario', inline: false }
        )
        .setTimestamp();
    
    return message.reply({ embeds: [embed] });
}

async function agregar(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso: `!agregar [item] [cantidad]`');
    }

    const cantidad = parseInt(args.pop());
    const item = args.join(' ').toLowerCase();
    
    if (isNaN(cantidad) || cantidad <= 0) {
        return message.reply('❌ Cantidad debe ser un número positivo');
    }

    if (!inventario[item]) inventario[item] = 0;
    inventario[item] += cantidad;
    
    const guardado = await guardarInventario();
    
    const embed = new EmbedBuilder()
        .setColor('#28a745')
        .setTitle('✅ Item Agregado')
        .addFields(
            { name: 'Item', value: item, inline: true },
            { name: 'Agregado', value: cantidad.toString(), inline: true },
            { name: 'Total', value: inventario[item].toString(), inline: true }
        )
        .setFooter({ text: guardado ? '💾 Guardado automáticamente' : '❌ Error al guardar' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function quitar(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso: `!quitar [item] [cantidad]`');
    }

    const cantidad = parseInt(args.pop());
    const item = args.join(' ').toLowerCase();
    
    if (isNaN(cantidad) || cantidad <= 0) {
        return message.reply('❌ Cantidad debe ser un número positivo');
    }

    if (!inventario[item]) {
        return message.reply(`❌ "${item}" no existe en inventario`);
    }

    if (inventario[item] < cantidad) {
        return message.reply(`❌ Stock insuficiente. Actual: ${inventario[item]}`);
    }
    
    inventario[item] -= cantidad;
    const guardado = await guardarInventario();

    const embed = new EmbedBuilder()
        .setColor('#dc3545')
        .setTitle('📤 Item Retirado')
        .addFields(
            { name: 'Item', value: item, inline: true },
            { name: 'Retirado', value: cantidad.toString(), inline: true },
            { name: 'Restante', value: inventario[item].toString(), inline: true }
        )
        .setFooter({ text: guardado ? '💾 Guardado automáticamente' : '❌ Error al guardar' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function stock(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso: `!stock [item]`');
    }

    const item = args.join(' ').toLowerCase();
    
    if (!inventario[item]) {
        return message.reply(`❌ "${item}" no existe en inventario`);
    }

    const cantidad = inventario[item];
    const color = cantidad === 0 ? '#dc3545' : cantidad < 10 ? '#ffc107' : '#28a745';
    const estado = cantidad === 0 ? '🔴 Agotado' : cantidad < 10 ? '🟡 Bajo' : '🟢 Normal';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('📊 Stock')
        .addFields(
            { name: 'Item', value: item, inline: true },
            { name: 'Cantidad', value: cantidad.toString(), inline: true },
            { name: 'Estado', value: estado, inline: true }
        )
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function mostrarInventario(message) {
    const items = Object.keys(inventario);
    
    if (items.length === 0) {
        return message.reply('📦 Inventario vacío');
    }

    let descripcion = '';
    let totalItems = 0, totalUnidades = 0;

    items.sort().forEach(item => {
        const cantidad = inventario[item];
        const estado = cantidad === 0 ? '🔴' : cantidad < 10 ? '🟡' : '🟢';
        descripcion += `${estado} **${item}**: ${cantidad}\n`;
        totalItems++;
        totalUnidades += cantidad;
    });

    const embed = new EmbedBuilder()
        .setColor('#17a2b8')
        .setTitle('📋 Inventario Completo')
        .setDescription(descripcion.length > 4000 ? descripcion.substring(0, 4000) + '...' : descripcion)
        .addFields(
            { name: 'Total Items', value: totalItems.toString(), inline: true },
            { name: 'Total Unidades', value: totalUnidades.toString(), inline: true },
            { name: 'Leyenda', value: '🟢 Normal | 🟡 Bajo | 🔴 Agotado', inline: false }
        )
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function buscar(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso: `!buscar [término]`');
    }

    const termino = args.join(' ').toLowerCase();
    const encontrados = Object.keys(inventario).filter(item => item.includes(termino));

    if (encontrados.length === 0) {
        return message.reply(`❌ No se encontró "${termino}"`);
    }

    let descripcion = '';
    encontrados.forEach(item => {
        const cantidad = inventario[item];
        const estado = cantidad === 0 ? '🔴' : cantidad < 10 ? '🟡' : '🟢';
        descripcion += `${estado} **${item}**: ${cantidad}\n`;
    });

    const embed = new EmbedBuilder()
        .setColor('#6f42c1')
        .setTitle('🔍 Búsqueda')
        .setDescription(`Resultados para "${termino}":\n\n${descripcion}`)
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function categorias(message) {
    const embed = new EmbedBuilder()
        .setColor('#8b0000')
        .setTitle('🗂️ Categorías')
        .setTimestamp();

    Object.keys(productos).forEach(cat => {
        const items = productos[cat];
        const muestra = items.slice(0, 3).join(', ') + (items.length > 3 ? '...' : '');
        
        const emoji = { 'armas': '🔫', 'cargadores': '📦', 'drogas': '💊', 'planos': '🗺️' }[cat] || '📋';
        
        embed.addFields({
            name: `${emoji} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
            value: muestra,
            inline: true
        });
    });

    return message.reply({ embeds: [embed] });
}

async function categoria(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso: `!categoria [nombre]`');
    }

    const cat = args.join(' ').toLowerCase();
    
    if (!productos[cat]) {
        return message.reply('❌ Categoría no existe. Usa `!categorias`');
    }

    let descripcion = '';
    productos[cat].forEach(item => {
        const enInventario = inventario[item] !== undefined;
        const stock = enInventario ? inventario[item] : 0;
        const estado = enInventario ? (stock > 0 ? '✅' : '⚪') : '➕';
        
        descripcion += `${estado} ${item}`;
        if (enInventario) descripcion += ` (${stock})`;
        descripcion += '\n';
    });

    const embed = new EmbedBuilder()
        .setColor('#ff6347')
        .setTitle(`🏷️ ${cat.charAt(0).toUpperCase() + cat.slice(1)}`)
        .setDescription(descripcion)
        .addFields({
            name: 'Leyenda',
            value: '✅ En inventario | ⚪ Sin stock | ➕ No añadido',
            inline: false
        })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function importar(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso: `!importar [categoría]`');
    }

    const cat = args.join(' ').toLowerCase();
    
    if (!productos[cat]) {
        return message.reply('❌ Categoría no existe');
    }

    let nuevos = [], existentes = [];

    productos[cat].forEach(item => {
        if (!inventario[item]) {
            inventario[item] = 0;
            nuevos.push(item);
        } else {
            existentes.push(item);
        }
    });

    const guardado = await guardarInventario();

    const embed = new EmbedBuilder()
        .setColor('#ff8c00')
        .setTitle(`📥 Importar: ${cat}`)
        .setDescription(
            (nuevos.length > 0 ? `✅ **Importados (${nuevos.length}):**\n${nuevos.join(', ')}\n\n` : '') +
            (existentes.length > 0 ? `⚠️ **Ya existían (${existentes.length}):**\n${existentes.join(', ')}` : '')
        )
        .setFooter({ text: guardado ? '💾 Guardado automáticamente' : '❌ Error al guardar' })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function guardarManual(message) {
    const guardado = await guardarInventario();
    
    const embed = new EmbedBuilder()
        .setColor(guardado ? '#28a745' : '#dc3545')
        .setTitle(guardado ? '✅ Guardado Exitoso' : '❌ Error al Guardar')
        .setDescription(guardado ? 'Inventario guardado correctamente' : 'Error al guardar el inventario')
        .addFields({
            name: 'Items en inventario',
            value: Object.keys(inventario).length.toString(),
            inline: true
        })
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function limpiar(message) {
    const embed = new EmbedBuilder()
        .setColor('#dc3545')
        .setTitle('⚠️ Confirmar Limpieza')
        .setDescription('Escribe `confirmar` para limpiar todo o `cancelar`')
        .setTimestamp();

    await message.reply({ embeds: [embed] });

    const filter = (response) => {
        return response.author.id === message.author.id && 
               ['confirmar', 'cancelar'].includes(response.content.toLowerCase());
    };

    try {
        const collected = await message.channel.awaitMessages({ 
            filter, max: 1, time: 30000, errors: ['time'] 
        });

        const respuesta = collected.first().content.toLowerCase();

        if (respuesta === 'confirmar') {
            inventario = {};
            const guardado = await guardarInventario();
            
            const confirmEmbed = new EmbedBuilder()
                .setColor('#28a745')
                .setTitle('✅ Inventario Limpiado')
                .setDescription('Inventario completamente limpiado')
                .setFooter({ text: guardado ? '💾 Guardado' : '❌ Error al guardar' })
                .setTimestamp();
            
            return message.channel.send({ embeds: [confirmEmbed] });
        } else {
            return message.channel.send('❌ Limpieza cancelada');
        }
    } catch {
        return message.channel.send('⏰ Tiempo agotado. Cancelado');
    }
}

// Event listeners
client.once('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    client.user.setActivity('Inventario GTA RP 🔫', { type: ActivityType.Watching });
    await cargarInventario();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const messageId = message.id;
    if (mensajesProcesados.has(messageId)) return;
    
    mensajesProcesados.add(messageId);
    setTimeout(() => mensajesProcesados.delete(messageId), 30000);

    const args = message.content.slice(1).trim().split(/ +/);
    const comando = args.shift().toLowerCase();

    try {
        switch (comando) {
            case 'ayuda': case 'help': await ayuda(message); break;
            case 'agregar': case 'add': await agregar(message, args); break;
            case 'quitar': case 'remove': await quitar(message, args); break;
            case 'stock': await stock(message, args); break;
            case 'inventario': case 'lista': await mostrarInventario(message); break;
            case 'buscar': case 'search': await buscar(message, args); break;
            case 'categorias': await categorias(message); break;
            case 'categoria': await categoria(message, args); break;
            case 'importar': await importar(message, args); break;
            case 'guardar': case 'save': await guardarManual(message); break;
            case 'limpiar': case 'clear': await limpiar(message); break;
            default: await message.reply('❌ Comando no reconocido. Usa `!ayuda`');
        }
    } catch (error) {
        console.error('Error:', error);
        await message.reply('❌ Error al procesar comando');
    }
});

// Iniciar bot
if (!DISCORD_TOKEN) {
    console.error('❌ Configura DISCORD_TOKEN en variables de entorno');
    process.exit(1);
}

client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error al conectar:', error);
    process.exit(1);
});
