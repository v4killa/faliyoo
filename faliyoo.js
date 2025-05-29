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

// Variable para evitar procesamiento múltiple
let isProcessing = false;

// Cache para evitar procesar el mismo mensaje múltiples veces
const processedMessages = new Set();

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

// Utilidad mejorada para dividir texto manteniendo límites de Discord
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
    let totalUnidades = 0;

    productosEnPagina.forEach(producto => {
        const stock = inventario[producto];
        const icono = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${icono} **${producto}**: ${stock}\n`;
        totalUnidades += stock;
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
        embed.setFooter({ text: `Página ${pagina} de ${totalPaginas} • Usa !inventory [página] para navegar` });
    }

    return { embed, totalPaginas };
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
                { name: '!inventory [página]', value: 'Ver inventario completo', inline: true },
                { name: '!search [término]', value: 'Buscar items', inline: true },
                { name: '!categories', value: 'Ver categorías', inline: true },
                { name: '!category [nombre]', value: 'Items de categoría', inline: true },
                { name: '!import [categoría]', value: 'Importar categoría', inline: true },
                { name: '!create [item1,item2,...]', value: 'Crear múltiples items', inline: true },
                { name: '!save', value: 'Guardar inventario manualmente', inline: true }
            )
            .setFooter({ text: 'Inventario con persistencia JSON' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
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
        const stockAnterior = inventario[producto] || 0;
        inventario[producto] = stockAnterior + cantidad;

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

        return message.reply({ embeds: [embed] });
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

        return message.reply({ embeds: [embed] });
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

        return message.reply({ embeds: [embed] });
    },

    // Ver inventario completo - CORREGIDO para enviar solo un mensaje
    async inventory(message, args) {
        const productos = Object.keys(inventario);
        
        if (productos.length === 0) {
            return message.reply('📦 Inventario vacío');
        }

        // Determinar página solicitada
        let pagina = 1;
        if (args.length > 0) {
            const paginaSolicitada = parseInt(args[0]);
            if (!isNaN(paginaSolicitada) && paginaSolicitada > 0) {
                pagina = paginaSolicitada;
            }
        }

        const { embed, totalPaginas } = crearInventarioEmbed(inventario, pagina);
        
        // Verificar si la página solicitada existe
        if (pagina > totalPaginas) {
            return message.reply(`❌ Página ${pagina} no existe. Total de páginas: ${totalPaginas}`);
        }

        return message.reply({ embeds: [embed] });
    },

    // Buscar productos
    async search(message, args) {
        if (args.length === 0) {
            return message.reply('❌ Uso: `!search [término]`');
        }

        const termino = args.join(' ').toLowerCase();
        const encontrados = Object.keys(inventario)
            .filter(producto => producto.includes(termino));

        if (encontrados.length === 0) {
            return message.reply(`❌ No se encontraron productos con "${termino}"`);
        }

        // Limitar resultados para evitar mensajes muy largos
        const maxResultados = 20;
        const productosLimitados = encontrados.slice(0, maxResultados);
        
        let descripcion = productosLimitados
            .map(producto => `**${producto}**: ${inventario[producto]}`)
            .join('\n');

        if (encontrados.length > maxResultados) {
            descripcion += `\n\n*... y ${encontrados.length - maxResultados} resultados más*`;
        }

        const embed = new EmbedBuilder()
            .setColor('#ffc107')
            .setTitle(`🔍 Resultados de Búsqueda (${encontrados.length})`)
            .setDescription(descripcion)
            .setTimestamp();

        return message.reply({ embeds: [embed] });
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

        return message.reply({ embeds: [embed] });
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

        return message.reply({ embeds: [embed] });
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

        return message.reply({ embeds: [embed] });
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

        return message.reply({ embeds: [embed] });
    },

    // Guardado manual
    async save(message) {
        const guardado = await guardarInventario();
        
        const embed = new EmbedBuilder()
            .setColor(guardado ? '#28a745' : '#dc3545')
            .setTitle(guardado ? '💾 Inventario Guardado' : '❌ Error al Guardar')
            .setDescription(guardado ? 
                'El inventario se ha guardado correctamente en el archivo JSON.' : 
                'Hubo un error al intentar guardar el inventario.'
            )
            .addFields({
                name: 'Total de productos',
                value: Object.keys(inventario).length.toString(),
                inline: true
            })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    }
};

// Eventos del bot
client.once('ready', async () => {
    console.log(`✅ Bot conectado: ${client.user.tag}`);
    console.log(`🤖 ID del bot: ${client.user.id}`);
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
    // Verificaciones básicas
    if (message.author.bot || !message.content.startsWith(config.prefix)) return;
    
    // Evitar procesar el mismo mensaje múltiples veces
    const messageId = `${message.id}-${message.author.id}`;
    if (processedMessages.has(messageId)) {
        console.log(`⚠️ Mensaje ya procesado: ${messageId}`);
        return;
    }
    
    // Evitar procesamiento concurrente
    if (isProcessing) {
        console.log('⚠️ Bot ocupado procesando otro comando');
        return message.reply('⏳ Bot ocupado, intenta de nuevo en un momento...');
    }

    // Marcar mensaje como procesado
    processedMessages.add(messageId);
    
    // Limpiar cache cada 100 mensajes
    if (processedMessages.size > 100) {
        processedMessages.clear();
    }
    
    isProcessing = true;

    try {
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
            'create': 'create', 'crear': 'create',
            'save': 'save', 'guardar': 'save'
        };

        const commandName = commandMap[comando];
        
        if (commandName && commands[commandName]) {
            console.log(`🔧 Ejecutando comando: ${commandName} por ${message.author.tag}`);
            await commands[commandName](message, args);
        } else {
            await message.reply('❌ Comando no válido. Usa `!help` para ver comandos');
        }
    } catch (error) {
        console.error('❌ Error en comando:', error);
        await message.reply('❌ Error al procesar comando');
    } finally {
        isProcessing = false;
    }
});

// Manejo de errores
client.on('error', error => {
    console.error('❌ Error del cliente Discord:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Error no manejado:', error);
});

// Validación y inicio
if (!config.token) {
    console.error('❌ Falta DISCORD_TOKEN en variables de entorno');
    process.exit(1);
}

console.log('🚀 Iniciando bot con persistencia JSON...');
client.login(config.token);
