const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// Configuración
const config = {
    token: process.env.DISCORD_TOKEN,
    prefix: '!',
    inventoryFile: path.join(__dirname, 'inventario.json')
};

// Cliente Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Inventario en memoria
let inventario = {};

// SISTEMA ULTRA AGRESIVO ANTI-DUPLICADOS
const commandLocks = new Map(); // Lock por usuario+comando
const globalProcessing = new Set(); // Lock global
const COMMAND_COOLDOWN = 2000; // 2 segundos entre comandos del mismo usuario

// Productos predefinidos por categorías
const categorias = {
    'armas': ['vintage', 'glock', 'beretta', 'ak47', 'uzi'],
    'cargadores': ['cargador pistolas', 'cargador subfusil'],
    'drogas': ['bongs', 'pcp', 'galletas', 'fentanilo', 'cocaina', 'marihuana', 'heroina'],
    'planos': ['supermercado', 'gasolinera', 'joyeria', 'barberia', 'licoreria', 'tatuajes', 'arquitectonicos', 'farmacia', 'ropa', 'banco']
};

// Funciones de archivo JSON
async function cargarInventario() {
    try {
        const data = await fs.readFile(config.inventoryFile, 'utf8');
        inventario = JSON.parse(data);
        console.log('✅ Inventario cargado desde JSON');
    } catch (error) {
        console.log('📝 Creando nuevo inventario...');
        inventario = {};
        await guardarInventario();
    }
}

async function guardarInventario() {
    try {
        await fs.writeFile(config.inventoryFile, JSON.stringify(inventario, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar:', error);
        return false;
    }
}

// FUNCIÓN ANTI-SPAM ULTRA AGRESIVA
function puedeEjecutarComando(userId, comando) {
    const ahora = Date.now();
    const key = `${userId}-${comando}`;
    
    // Verificar cooldown específico del usuario+comando
    if (commandLocks.has(key)) {
        const ultimoComando = commandLocks.get(key);
        if (ahora - ultimoComando < COMMAND_COOLDOWN) {
            console.log(`🚫 COOLDOWN: Usuario ${userId} comando ${comando} - ${COMMAND_COOLDOWN - (ahora - ultimoComando)}ms restantes`);
            return false;
        }
    }
    
    // Verificar si ya se está procesando globalmente
    if (globalProcessing.has(key)) {
        console.log(`🚫 PROCESANDO: Comando ${key} ya en ejecución`);
        return false;
    }
    
    return true;
}

function marcarComandoEnUso(userId, comando) {
    const key = `${userId}-${comando}`;
    commandLocks.set(key, Date.now());
    globalProcessing.add(key);
    
    // Auto-limpiar después de 10 segundos (por si algo falla)
    setTimeout(() => {
        globalProcessing.delete(key);
    }, 10000);
}

function liberarComando(userId, comando) {
    const key = `${userId}-${comando}`;
    globalProcessing.delete(key);
}

// Utilidad para crear embeds de inventario
function crearInventarioEmbed(inventario, pagina = 1, itemsPorPagina = 20) {
    const productos = Object.keys(inventario).sort();
    const totalItems = productos.length;
    const totalPaginas = Math.ceil(totalItems / itemsPorPagina);
    
    if (totalItems === 0) {
        return {
            embed: new EmbedBuilder()
                .setColor('#17a2b8')
                .setTitle('📋 Inventario')
                .setDescription('📦 Inventario vacío')
                .setTimestamp(),
            totalPaginas: 1
        };
    }

    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const productosEnPagina = productos.slice(inicio, fin);
    
    let descripcion = '';
    productosEnPagina.forEach(producto => {
        const stock = inventario[producto];
        const icono = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${icono} **${producto}**: ${stock}\n`;
    });

    const embed = new EmbedBuilder()
        .setColor('#17a2b8')
        .setTitle(`📋 Inventario ${totalPaginas > 1 ? `(${pagina}/${totalPaginas})` : ''}`)
        .setDescription(descripcion)
        .addFields(
            { name: 'Items mostrados', value: productosEnPagina.length.toString(), inline: true },
            { name: 'Total items', value: totalItems.toString(), inline: true },
            { name: 'Total unidades', value: Object.values(inventario).reduce((a, b) => a + b, 0).toString(), inline: true }
        )
        .setTimestamp();

    if (totalPaginas > 1) {
        embed.setFooter({ text: `Página ${pagina} de ${totalPaginas}` });
    }

    return { embed, totalPaginas };
}

// COMANDOS - SOLO LOS PRINCIPALES
const commands = {
    async inventory(message, args) {
        if (Object.keys(inventario).length === 0) {
            return await message.reply('📦 Inventario vacío');
        }

        let pagina = 1;
        if (args.length > 0) {
            const paginaSolicitada = parseInt(args[0]);
            if (!isNaN(paginaSolicitada) && paginaSolicitada > 0) {
                pagina = paginaSolicitada;
            }
        }

        const { embed, totalPaginas } = crearInventarioEmbed(inventario, pagina);
        
        if (pagina > totalPaginas) {
            return await message.reply(`❌ Página ${pagina} no existe. Total: ${totalPaginas}`);
        }

        return await message.reply({ embeds: [embed] });
    },

    async add(message, args) {
        if (args.length < 2) {
            return await message.reply('❌ Uso: `!add [producto] [cantidad]`');
        }

        const cantidad = parseInt(args[args.length - 1]);
        if (isNaN(cantidad) || cantidad <= 0) {
            return await message.reply('❌ Cantidad debe ser un número positivo');
        }

        const producto = args.slice(0, -1).join(' ').toLowerCase();
        inventario[producto] = (inventario[producto] || 0) + cantidad;
        await guardarInventario();
        
        const embed = new EmbedBuilder()
            .setColor('#28a745')
            .setTitle('✅ Producto Agregado')
            .addFields(
                { name: 'Item', value: producto, inline: true },
                { name: 'Agregado', value: cantidad.toString(), inline: true },
                { name: 'Total', value: inventario[producto].toString(), inline: true }
            )
            .setTimestamp();

        return await message.reply({ embeds: [embed] });
    },

    async remove(message, args) {
        if (args.length < 2) {
            return await message.reply('❌ Uso: `!remove [producto] [cantidad]`');
        }

        const cantidad = parseInt(args[args.length - 1]);
        if (isNaN(cantidad) || cantidad <= 0) {
            return await message.reply('❌ Cantidad debe ser un número positivo');
        }

        const producto = args.slice(0, -1).join(' ').toLowerCase();
        
        if (!inventario[producto] || inventario[producto] < cantidad) {
            return await message.reply(`❌ Stock insuficiente. Actual: ${inventario[producto] || 0}`);
        }

        inventario[producto] -= cantidad;
        await guardarInventario();

        const embed = new EmbedBuilder()
            .setColor('#dc3545')
            .setTitle('📤 Producto Retirado')
            .addFields(
                { name: 'Item', value: producto, inline: true },
                { name: 'Retirado', value: cantidad.toString(), inline: true },
                { name: 'Restante', value: inventario[producto].toString(), inline: true }
            )
            .setTimestamp();

        return await message.reply({ embeds: [embed] });
    },

    async stock(message, args) {
        if (args.length === 0) {
            return await message.reply('❌ Uso: `!stock [producto]`');
        }

        const producto = args.join(' ').toLowerCase();
        const stock = inventario[producto] || 0;
        const color = stock === 0 ? '#dc3545' : stock < 10 ? '#ffc107' : '#28a745';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('📊 Stock del Producto')
            .addFields(
                { name: 'Producto', value: producto, inline: true },
                { name: 'Stock', value: stock.toString(), inline: true }
            )
            .setTimestamp();

        return await message.reply({ embeds: [embed] });
    },

    async help(message) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎮 Bot de Inventario GTA RP')
            .addFields(
                { name: '!add [item] [cantidad]', value: 'Agregar items', inline: true },
                { name: '!remove [item] [cantidad]', value: 'Quitar items', inline: true },
                { name: '!stock [item]', value: 'Ver stock específico', inline: true },
                { name: '!inventory [página]', value: 'Ver inventario', inline: true }
            )
            .setTimestamp();

        return await message.reply({ embeds: [embed] });
    }
};

// Eventos del bot
client.once('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    console.log(`🆔 Bot ID: ${client.user.id}`);
    console.log(`⏰ Hora: ${new Date().toLocaleString()}`);
    
    client.user.setActivity('Inventario GTA RP', { type: ActivityType.Watching });
    await cargarInventario();
    
    // Productos básicos si está vacío
    if (Object.keys(inventario).length === 0) {
        ['glock', 'beretta', 'cargador pistolas', 'bongs', 'supermercado'].forEach(p => inventario[p] = 0);
        await guardarInventario();
    }
    
    console.log('🎯 LISTO - Sistema anti-spam activado');
});

// EVENTO PRINCIPAL - ULTRA SIMPLIFICADO
client.on('messageCreate', async (message) => {
    // Filtros básicos
    if (message.author.bot) return;
    if (!message.content.startsWith(config.prefix)) return;
    if (!message.guild) return;
    
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const comando = args.shift().toLowerCase();
    
    // Mapeo de comandos
    const commandMap = {
        'inventory': 'inventory', 'inventario': 'inventory', 'lista': 'inventory',
        'add': 'add', 'agregar': 'add',
        'remove': 'remove', 'quitar': 'remove',
        'stock': 'stock',
        'help': 'help', 'ayuda': 'help'
    };
    
    const commandName = commandMap[comando];
    if (!commandName || !commands[commandName]) {
        return; // Ignorar comandos no válidos silenciosamente
    }
    
    const userId = message.author.id;
    
    // VERIFICACIÓN ANTI-SPAM
    if (!puedeEjecutarComando(userId, commandName)) {
        return; // Ignorar silenciosamente si está en cooldown
    }
    
    // Marcar como en uso
    marcarComandoEnUso(userId, commandName);
    
    console.log(`🔥 EJECUTANDO: ${commandName} - Usuario: ${message.author.tag} - Canal: ${message.channel.name}`);
    
    try {
        await commands[commandName](message, args);
        console.log(`✅ COMPLETADO: ${commandName}`);
    } catch (error) {
        console.error(`❌ ERROR en ${commandName}:`, error);
        try {
            await message.reply('❌ Error interno del bot');
        } catch (e) {
            console.error('❌ Error al enviar mensaje de error:', e);
        }
    } finally {
        // SIEMPRE liberar el comando
        liberarComando(userId, commandName);
    }
});

// Manejo de errores
client.on('error', error => {
    console.error('❌ Error cliente Discord:', error);
});

// Validación y inicio
if (!config.token) {
    console.error('❌ FALTA DISCORD_TOKEN');
    process.exit(1);
}

console.log('🚀 INICIANDO BOT - VERSIÓN ANTI-SPAM EXTREMA');
console.log('⚠️  COOLDOWN ENTRE COMANDOS: 2 segundos');

client.login(config.token).catch(error => {
    console.error('❌ Error al conectar:', error);
    process.exit(1);
});
