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
        console.log('💾 Inventario guardado en JSON');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar:', error);
        return false;
    }
}

// Utilidades
function dividirTexto(texto, limite = 4000) {
    if (texto.length <= limite) return [texto];
    
    const partes = [];
    let inicio = 0;
    
    while (inicio < texto.length) {
        let fin = inicio + limite;
        if (fin < texto.length) {
            const ultimoSalto = texto.lastIndexOf('\n', fin);
            if (ultimoSalto > inicio) fin = ultimoSalto;
        }
        partes.push(texto.slice(inicio, fin));
        inicio = fin;
    }
    
    return partes;
}

// Comandos del bot
const commands = {
    // Ayuda
    async help(message) {
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🎮 Bot de Inventario GTA RP')
            .setDescription('**Comandos principales:**')
            .addFields(
                { name: '!add [item] [cantidad]', value: 'Agregar items', inline: true },
                { name: '!remove [item] [cantidad]', value: 'Quitar items', inline: true },
                { name: '!stock [item]', value: 'Ver stock específico', inline: true },
                { name: '!inventory', value: 'Ver inventario completo', inline: true },
                { name: '!search [término]', value: 'Buscar items', inline: true },
                { name: '!categories', value: 'Ver categorías', inline: true },
                { name: '!category [nombre]', value: 'Items de categoría', inline: true },
                { name: '!import [categoría]', value: 'Importar categoría', inline: true },
                { name: '!create [item1,item2,...]', value: 'Crear múltiples items', inline: true }
            )
            .setFooter({ text: 'Inventario con persistencia JSON' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    // Agregar producto
    async add(message, args) {
        if (args.length < 2) {
            return message.reply('❌ Uso: `!add [producto] [cantidad]`');
        }

        const cantidad = parseInt(args[args.length - 1]);
        if (isNaN(cantidad) || cantidad <= 0) {
            return message.reply('❌ Cantidad debe ser un número positivo');
        }

        const producto = args.slice(0, -1).join(' ').toLowerCase();
        inventario[producto] = (inventario[producto] || 0) + cantidad;

        const guardado = await guardarInventario();
        
        const embed = new EmbedBuilder()
            .setColor('#28a745')
            .setTitle('✅ Producto Agregado')
            .addFields(
                { name: 'Item', value: producto, inline: true },
                { name: 'Agregado', value: cantidad.toString(), inline: true },
                { name: 'Total', value: inventario[producto].toString(), inline: true }
            )
            .setFooter({ text: guardado ? 'Guardado en JSON ✅' : 'Error al guardar ❌' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    // Quitar producto
    async remove(message, args) {
        if (args.length < 2) {
            return message.reply('❌ Uso: `!remove [producto] [cantidad]`');
        }

        const cantidad = parseInt(args[args.length - 1]);
        if (isNaN(cantidad) || cantidad <= 0) {
            return message.reply('❌ Cantidad debe ser un número positivo');
        }

        const producto = args.slice(0, -1).join(' ').toLowerCase();
        
        if (!inventario[producto]) {
            return message.reply(`❌ "${producto}" no existe en inventario`);
        }

        if (inventario[producto] < cantidad) {
            return message.reply(`❌ Stock insuficiente. Actual: ${inventario[producto]}`);
        }

        inventario[producto] -= cantidad;
        const guardado = await guardarInventario();

        const embed = new EmbedBuilder()
            .setColor('#dc3545')
            .setTitle('📤 Producto Retirado')
            .addFields(
                { name: 'Item', value: producto, inline: true },
                { name: 'Retirado', value: cantidad.toString(), inline: true },
                { name: 'Restante', value: inventario[producto].toString(), inline: true }
            )
            .setFooter({ text: guardado ? 'Guardado en JSON ✅' : 'Error al guardar ❌' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    // Ver stock específico
    async stock(message, args) {
        if (args.length === 0) {
            return message.reply('❌ Uso: `!stock [producto]`');
        }

        const producto = args.join(' ').toLowerCase();
        const stock = inventario[producto] || 0;
        const color = stock === 0 ? '#dc3545' : stock < 10 ? '#ffc107' : '#28a745';
        const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Bajo' : '🟢 Normal';

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('📊 Stock del Producto')
            .addFields(
                { name: 'Producto', value: producto, inline: true },
                { name: 'Stock', value: stock.toString(), inline: true },
                { name: 'Estado', value: estado, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    // Ver inventario completo
    async inventory(message) {
        const productos = Object.keys(inventario);
        
        if (productos.length === 0) {
            return message.reply('📦 Inventario vacío');
        }

        let descripcion = '';
        let totalItems = 0;
        let totalUnidades = 0;

        productos.sort().forEach(producto => {
            const stock = inventario[producto];
            const icono = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
            descripcion += `${icono} **${producto}**: ${stock}\n`;
            totalItems++;
            totalUnidades += stock;
        });

        const partes = dividirTexto(descripcion);
        
        for (let i = 0; i < partes.length; i++) {
            const embed = new EmbedBuilder()
                .setColor('#17a2b8')
                .setTitle(`📋 Inventario ${partes.length > 1 ? `(${i + 1}/${partes.length})` : ''}`)
                .setDescription(partes[i])
                .setTimestamp();

            if (i === partes.length - 1) {
                embed.addFields(
                    { name: 'Total Items', value: totalItems.toString(), inline: true },
                    { name: 'Total Unidades', value: totalUnidades.toString(), inline: true }
                );
            }

            await message.reply({ embeds: [embed] });
        }
    },

    // Buscar productos
    async search(message, args) {
        if (args.length === 0) {
            return message.reply('❌ Uso: `!search [término]`');
        }

        const termino = args.join(' ').toLowerCase();
        const encontrados = Object.keys(inventario)
            .filter(producto => producto.includes(termino))
            .map(producto => `**${producto}**: ${inventario[producto]}`)
            .join('\n');

        if (!encontrados) {
            return message.reply(`❌ No se encontraron productos con "${termino}"`);
        }

        const embed = new EmbedBuilder()
            .setColor('#ffc107')
            .setTitle('🔍 Resultados de Búsqueda')
            .setDescription(encontrados)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    // Mostrar categorías
    async categories(message) {
        const embed = new EmbedBuilder()
            .setColor('#8b0000')
            .setTitle('🗂️ Categorías Disponibles')
            .setTimestamp();

        Object.keys(categorias).forEach(categoria => {
            const productos = categorias[categoria];
            const muestra = productos.slice(0, 3).join(', ');
            const extras = productos.length > 3 ? ` y ${productos.length - 3} más...` : '';
            
            const emoji = {
                'armas': '🔫',
                'cargadores': '📦',
                'drogas': '💊',
                'planos': '🗺️'
            }[categoria] || '📋';
            
            embed.addFields({
                name: `${emoji} ${categoria.charAt(0).toUpperCase() + categoria.slice(1)}`,
                value: `${muestra}${extras}`,
                inline: true
            });
        });

        await message.reply({ embeds: [embed] });
    },

    // Ver productos de una categoría
    async category(message, args) {
        if (args.length === 0) {
            return message.reply('❌ Uso: `!category [nombre]`');
        }

        const categoria = args.join(' ').toLowerCase();
        
        if (!categorias[categoria]) {
            return message.reply(`❌ Categoría "${categoria}" no existe`);
        }

        const productos = categorias[categoria];
        let descripcion = '';
        
        productos.forEach(producto => {
            const enInventario = inventario.hasOwnProperty(producto);
            const stock = enInventario ? inventario[producto] : 0;
            const icono = enInventario ? (stock > 0 ? '✅' : '⚪') : '➕';
            
            descripcion += `${icono} **${producto}**`;
            if (enInventario) descripcion += ` (${stock})`;
            descripcion += '\n';
        });

        const embed = new EmbedBuilder()
            .setColor('#ff6347')
            .setTitle(`🏷️ Categoría: ${categoria.charAt(0).toUpperCase() + categoria.slice(1)}`)
            .setDescription(descripcion)
            .addFields({
                name: 'Leyenda',
                value: '✅ En inventario con stock\n⚪ En inventario sin stock\n➕ No añadido',
                inline: false
            })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    },

    // Importar categoría completa
    async import(message, args) {
        if (args.length === 0) {
            return message.reply('❌ Uso: `!import [categoría]`');
        }

        const categoria = args.join(' ').toLowerCase();
        
        if (!categorias[categoria]) {
            return message.reply(`❌ Categoría "${categoria}" no existe`);
        }

        const productos = categorias[categoria];
        let nuevos = [];
        let existentes = [];

        productos.forEach(producto => {
            if (!inventario.hasOwnProperty(producto)) {
                inventario[producto] = 0;
                nuevos.push(producto);
            } else {
                existentes.push(producto);
            }
        });

        const guardado = await guardarInventario();

        const embed = new EmbedBuilder()
            .setColor('#ff8c00')
            .setTitle(`📥 Importar: ${categoria.charAt(0).toUpperCase() + categoria.slice(1)}`)
            .setTimestamp();

        let descripcion = `**Total:** ${productos.length} productos\n\n`;
        
        if (nuevos.length > 0) {
            descripcion += `✅ **Importados (${nuevos.length}):**\n${nuevos.join(', ')}\n\n`;
        }

        if (existentes.length > 0) {
            descripcion += `⚠️ **Ya existían (${existentes.length}):**\n${existentes.join(', ')}`;
        }

        embed.setDescription(descripcion);
        embed.setFooter({ text: guardado ? 'Guardado en JSON ✅' : 'Error al guardar ❌' });

        await message.reply({ embeds: [embed] });
    },

    // Crear múltiples productos
    async create(message, args) {
        if (args.length === 0) {
            return message.reply('❌ Uso: `!create [item1,item2,item3]`');
        }

        const productosTexto = args.join(' ');
        const productos = productosTexto.split(',')
            .map(p => p.trim().toLowerCase())
            .filter(p => p.length > 0);

        if (productos.length === 0) {
            return message.reply('❌ No se encontraron productos válidos');
        }

        let nuevos = [];
        let existentes = [];

        productos.forEach(producto => {
            if (!inventario.hasOwnProperty(producto)) {
                inventario[producto] = 0;
                nuevos.push(producto);
            } else {
                existentes.push(producto);
            }
        });

        const guardado = await guardarInventario();

        const embed = new EmbedBuilder()
            .setColor('#4169e1')
            .setTitle('📦 Creación en Lote')
            .setTimestamp();

        let descripcion = '';
        
        if (nuevos.length > 0) {
            descripcion += `✅ **Creados (${nuevos.length}):**\n${nuevos.join(', ')}\n\n`;
        }

        if (existentes.length > 0) {
            descripcion += `⚠️ **Ya existían (${existentes.length}):**\n${existentes.join(', ')}`;
        }

        embed.setDescription(descripcion);
        embed.setFooter({ text: guardado ? 'Guardado en JSON ✅' : 'Error al guardar ❌' });

        await message.reply({ embeds: [embed] });
    }
};

// Eventos del bot
client.once('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    client.user.setActivity('Inventario GTA RP', { type: ActivityType.Watching });
    
    await cargarInventario();
    
    // Inicializar productos básicos si está vacío
    if (Object.keys(inventario).length === 0) {
        const basicos = ['glock', 'beretta', 'cargador pistolas', 'bongs', 'supermercado'];
        basicos.forEach(producto => inventario[producto] = 0);
        await guardarInventario();
        console.log('✅ Productos básicos inicializados');
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(config.prefix)) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const comando = args.shift().toLowerCase();

    // Mapeo de comandos con aliases
    const commandMap = {
        'help': 'help', 'ayuda': 'help',
        'add': 'add', 'agregar': 'add',
        'remove': 'remove', 'quitar': 'remove',
        'stock': 'stock',
        'inventory': 'inventory', 'inventario': 'inventory', 'lista': 'inventory',
        'search': 'search', 'buscar': 'search',
        'categories': 'categories', 'categorias': 'categories',
        'category': 'category', 'categoria': 'category',
        'import': 'import', 'importar': 'import',
        'create': 'create', 'crear': 'create'
    };

    const commandName = commandMap[comando];
    
    if (commandName && commands[commandName]) {
        try {
            await commands[commandName](message, args);
        } catch (error) {
            console.error('Error en comando:', error);
            await message.reply('❌ Error al procesar comando');
        }
    } else {
        await message.reply('❌ Comando no válido. Usa `!help` para ver comandos');
    }
});

// Validación y inicio
if (!config.token) {
    console.error('❌ Falta DISCORD_TOKEN en variables de entorno');
    process.exit(1);
}

console.log('🚀 Iniciando bot con persistencia JSON...');
client.login(config.token);
