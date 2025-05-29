const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// ⚠️ IMPORTANTE: Reemplaza 'TU_TOKEN_AQUI' con tu token real de Discord
const DISCORD_TOKEN = 'MTM1OTg5OTEwOTUxODk5OTU4Mg.GhMYia.Un6ldPdUrqP5HR84u1lpXUwgkU1CvFHF7uz0Gk';

// Archivo para guardar el inventario
const INVENTARIO_FILE = path.join(__dirname, 'inventario.json');

// Configuración del bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Base de datos del inventario
let inventario = {};

// Lista simplificada de productos con categorías para GTA Roleplay
const productosPredefindos = {
    'armas': ['vintage', 'glock', 'beretta', 'ak47', 'uzi'],
    'cargadores': ['cargador pistolas', 'cargador subfusil'],
    'drogas': ['bongs', 'pcp', 'galletas', 'fentanilo', 'cocaina', 'marihuana', 'heroina'],
    'planos': ['supermercado', 'gasolinera', 'joyeria', 'barberia', 'licoreria', 'tatuajes', 'arquitectonicos', 'farmacia', 'ropa', 'banco']
};

// Función para cargar el inventario desde el archivo JSON
async function cargarInventario() {
    try {
        const data = await fs.readFile(INVENTARIO_FILE, 'utf8');
        inventario = JSON.parse(data);
        console.log('✅ Inventario cargado desde archivo JSON');
    } catch (error) {
        console.log('📝 Archivo de inventario no encontrado, creando uno nuevo...');
        inventario = {};
        await guardarInventario();
    }
}

// Función para guardar el inventario en archivo JSON
async function guardarInventario() {
    try {
        await fs.writeFile(INVENTARIO_FILE, JSON.stringify(inventario, null, 2), 'utf8');
        console.log('💾 Inventario guardado en archivo JSON');
    } catch (error) {
        console.error('❌ Error al guardar inventario:', error);
    }
}

// Función para inicializar productos básicos
async function inicializarProductosBasicos() {
    if (Object.keys(inventario).length === 0) {
        const productosBasicos = [
            'glock', 'beretta', 'cargador pistolas', 'cargador subfusil', 'bongs', 'pcp', 'galletas',
            'supermercado', 'gasolinera', 'joyeria'
        ];
        
        productosBasicos.forEach(producto => {
            inventario[producto] = 0;
        });
        
        await guardarInventario();
        console.log('✅ Inventario básico de GTA RP inicializado');
    }
}

// Función para dividir embeds largos
function dividirEmbed(contenido, limite = 4096) {
    if (contenido.length <= limite) return [contenido];
    
    const partes = [];
    let inicio = 0;
    
    while (inicio < contenido.length) {
        let fin = inicio + limite;
        if (fin < contenido.length) {
            const ultimoSalto = contenido.lastIndexOf('\n', fin);
            if (ultimoSalto > inicio) {
                fin = ultimoSalto;
            }
        }
        partes.push(contenido.slice(inicio, fin));
        inicio = fin;
    }
    
    return partes;
}

async function mostrarCategorias(message) {
    const embed = new EmbedBuilder()
        .setColor('#8b0000')
        .setTitle('🗂️ Categorías de Items - GTA RP')
        .setDescription('Categorías disponibles para la banda:')
        .setTimestamp();

    Object.keys(productosPredefindos).forEach(categoria => {
        const productos = productosPredefindos[categoria];
        const muestra = productos.slice(0, 3).join(', ');
        const extras = productos.length > 3 ? ` y ${productos.length - 3} más...` : '';
        
        let emoji = '';
        switch(categoria) {
            case 'armas': emoji = '🔫'; break;
            case 'cargadores': emoji = '📦'; break;
            case 'drogas': emoji = '💊'; break;
            case 'planos': emoji = '🗺️'; break;
        }
        
        embed.addFields({
            name: `${emoji} ${categoria.charAt(0).toUpperCase() + categoria.slice(1)}`,
            value: `${muestra}${extras}`,
            inline: true
        });
    });

    embed.addFields({
        name: 'ℹ️ Uso',
        value: 'Usa `!categoria [nombre]` para ver todos los items de una categoría\nUsa `!importar [categoría]` para añadir todos los items al inventario',
        inline: false
    });

    await message.reply({ embeds: [embed] });
}

async function mostrarProductosCategoria(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso correcto: `!categoria [nombre]`\nEjemplo: `!categoria armas`\nUsa `!categorias` para ver todas las categorías.');
    }

    const categoria = args.join(' ').toLowerCase();
    
    if (!productosPredefindos[categoria]) {
        return message.reply(`❌ La categoría "${categoria}" no existe. Usa \`!categorias\` para ver las categorías disponibles.`);
    }

    const productos = productosPredefindos[categoria];
    
    let descripcion = '';
    productos.forEach(producto => {
        const enInventario = inventario.hasOwnProperty(producto);
        const stock = enInventario ? inventario[producto] : 0;
        const estado = enInventario ? (stock > 0 ? '✅' : '⚪') : '➕';
        
        descripcion += `${estado} ${producto.charAt(0).toUpperCase() + producto.slice(1)}`;
        if (enInventario) descripcion += ` (${stock})`;
        descripcion += '\n';
    });

    const partes = dividirEmbed(descripcion);
    
    for (let i = 0; i < partes.length; i++) {
        const embed = new EmbedBuilder()
            .setColor('#ff6347')
            .setTitle(`🏷️ Categoría: ${categoria.charAt(0).toUpperCase() + categoria.slice(1)} ${partes.length > 1 ? `(${i + 1}/${partes.length})` : ''}`)
            .setDescription(`Productos en esta categoría (${productos.length} total):`)
            .setTimestamp();

        embed.addFields({ name: 'Productos', value: partes[i], inline: false });
        
        if (i === partes.length - 1) {
            embed.addFields({
                name: 'Leyenda',
                value: '✅ En inventario con stock\n⚪ En inventario sin stock\n➕ No añadido al inventario',
                inline: false
            });
        }

        await message.reply({ embeds: [embed] });
    }
}

async function sugerirProductos(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso correcto: `!sugerir [término]`\nEjemplo: `!sugerir glock`');
    }

    const termino = args.join(' ').toLowerCase();
    let sugerencias = [];

    Object.keys(productosPredefindos).forEach(categoria => {
        productosPredefindos[categoria].forEach(producto => {
            if (producto.includes(termino)) {
                sugerencias.push({ producto, categoria });
            }
        });
    });

    if (sugerencias.length === 0) {
        return message.reply(`❌ No se encontraron sugerencias para "${termino}".`);
    }

    const embed = new EmbedBuilder()
        .setColor('#32cd32')
        .setTitle('💡 Sugerencias de Productos')
        .setDescription(`Productos sugeridos que contienen "${termino}":`)
        .setTimestamp();

    let descripcion = '';
    sugerencias.slice(0, 15).forEach(({ producto, categoria }) => {
        const enInventario = inventario.hasOwnProperty(producto) ? '✅' : '➕';
        descripcion += `${enInventario} **${producto.charAt(0).toUpperCase() + producto.slice(1)}** (${categoria})\n`;
    });

    if (sugerencias.length > 15) {
        descripcion += `\n... y ${sugerencias.length - 15} más`;
    }

    embed.addFields({ name: 'Sugerencias', value: descripcion, inline: false });

    await message.reply({ embeds: [embed] });
}

async function crearProductosLote(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso correcto: `!crear [producto1,producto2,producto3]`\nEjemplo: `!crear ak47,uzi,vintage`');
    }

    const productosTexto = args.join(' ');
    const productos = productosTexto.split(',').map(p => p.trim().toLowerCase()).filter(p => p.length > 0);

    if (productos.length === 0) {
        return message.reply('❌ No se encontraron productos válidos. Separa los productos con comas.');
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

    // Guardar cambios automáticamente
    await guardarInventario();

    const embed = new EmbedBuilder()
        .setColor('#4169e1')
        .setTitle('📦 Creación de Productos en Lote')
        .setTimestamp();

    let descripcion = '';
    
    if (nuevos.length > 0) {
        descripcion += `✅ **Productos creados (${nuevos.length}):**\n`;
        descripcion += nuevos.map(p => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join('\n');
        descripcion += '\n\n';
    }

    if (existentes.length > 0) {
        descripcion += `⚠️ **Ya existían (${existentes.length}):**\n`;
        descripcion += existentes.map(p => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join('\n');
    }

    embed.setDescription(descripcion);

    await message.reply({ embeds: [embed] });
}

async function importarProductos(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso correcto: `!importar [categoría]`\nEjemplo: `!importar armas`\nUsa `!categorias` para ver las categorías disponibles.');
    }

    const categoria = args.join(' ').toLowerCase();
    
    if (!productosPredefindos[categoria]) {
        return message.reply(`❌ La categoría "${categoria}" no existe. Usa \`!categorias\` para ver las categorías disponibles.`);
    }

    const productos = productosPredefindos[categoria];
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

    // Guardar cambios automáticamente
    await guardarInventario();

    const embed = new EmbedBuilder()
        .setColor('#ff8c00')
        .setTitle(`📥 Importar Categoría: ${categoria.charAt(0).toUpperCase() + categoria.slice(1)}`)
        .setTimestamp();

    let descripcion = `**Total de productos en la categoría:** ${productos.length}\n\n`;
    
    if (nuevos.length > 0) {
        descripcion += `✅ **Productos importados (${nuevos.length}):**\n`;
        descripcion += nuevos.map(p => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join('\n');
        descripcion += '\n\n';
    }

    if (existentes.length > 0) {
        descripcion += `⚠️ **Ya existían (${existentes.length}):**\n`;
        descripcion += existentes.map(p => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join('\n');
    }

    if (nuevos.length === 0 && existentes.length === productos.length) {
        descripcion += '✅ Todos los productos de esta categoría ya estaban en el inventario.';
    }

    embed.setDescription(descripcion);

    await message.reply({ embeds: [embed] });
}

async function mostrarAyuda(message) {
    const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🔫 Bot de Inventario GTA RP - Comandos')
        .setDescription('Lista de comandos disponibles para la banda:')
        .addFields(
            { name: '**!agregar [item] [cantidad]**', value: 'Agrega items al inventario\nEjemplo: `!agregar glock 5`', inline: false },
            { name: '**!quitar [item] [cantidad]**', value: 'Quita items del inventario\nEjemplo: `!quitar beretta 2`', inline: false },
            { name: '**!stock [item]**', value: 'Muestra el stock de un item específico\nEjemplo: `!stock vintage`', inline: false },
            { name: '**!inventario**', value: 'Muestra todo el inventario de la banda', inline: false },
            { name: '**!buscar [término]**', value: 'Busca items que contengan el término\nEjemplo: `!buscar glock`', inline: false },
            { name: '**!categorias**', value: 'Muestra todas las categorías disponibles', inline: false },
            { name: '**!categoria [nombre]**', value: 'Muestra items de una categoría\nEjemplo: `!categoria armas`', inline: false },
            { name: '**!sugerir [término]**', value: 'Sugiere items similares\nEjemplo: `!sugerir pistol`', inline: false },
            { name: '**!crear [item1,item2,...]**', value: 'Crea múltiples items a la vez\nEjemplo: `!crear ak47,uzi,vintage`', inline: false },
            { name: '**!importar [categoría]**', value: 'Importa todos los items de una categoría\nEjemplo: `!importar planos`', inline: false },
            { name: '**!limpiar**', value: 'Limpia todo el inventario (requiere confirmación)', inline: false }
        )
        .setFooter({ text: 'Bot de Inventario GTA RP v3.0 - Versión Simplificada con JSON' })
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function agregarProducto(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso correcto: `!agregar [producto] [cantidad]`\nEjemplo: `!agregar glock 50`');
    }

    const cantidad = parseInt(args[args.length - 1]);
    if (isNaN(cantidad) || cantidad <= 0) {
        return message.reply('❌ La cantidad debe ser un número positivo.');
    }

    const producto = args.slice(0, -1).join(' ').toLowerCase();
    
    if (!inventario[producto]) {
        inventario[producto] = 0;
    }
    
    inventario[producto] += cantidad;

    // Guardar automáticamente
    await guardarInventario();

    const embed = new EmbedBuilder()
        .setColor('#28a745')
        .setTitle('✅ Producto Agregado')
        .addFields(
            { name: 'Producto', value: producto.charAt(0).toUpperCase() + producto.slice(1), inline: true },
            { name: 'Cantidad Agregada', value: cantidad.toString(), inline: true },
            { name: 'Stock Total', value: inventario[producto].toString(), inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function quitarProducto(message, args) {
    if (args.length < 2) {
        return message.reply('❌ Uso correcto: `!quitar [producto] [cantidad]`\nEjemplo: `!quitar glock 10`');
    }

    const cantidad = parseInt(args[args.length - 1]);
    if (isNaN(cantidad) || cantidad <= 0) {
        return message.reply('❌ La cantidad debe ser un número positivo.');
    }

    const producto = args.slice(0, -1).join(' ').toLowerCase();
    
    if (!inventario[producto]) {
        return message.reply(`❌ El producto "${producto}" no existe en el inventario.`);
    }

    if (inventario[producto] < cantidad) {
        return message.reply(`❌ No hay suficiente stock. Stock actual: ${inventario[producto]}`);
    }
    
    inventario[producto] -= cantidad;

    // Guardar automáticamente
    await guardarInventario();

    const embed = new EmbedBuilder()
        .setColor('#dc3545')
        .setTitle('📤 Producto Retirado')
        .addFields(
            { name: 'Producto', value: producto.charAt(0).toUpperCase() + producto.slice(1), inline: true },
            { name: 'Cantidad Retirada', value: cantidad.toString(), inline: true },
            { name: 'Stock Restante', value: inventario[producto].toString(), inline: true }
        )
        .setTimestamp();

    if (inventario[producto] === 0) {
        embed.setDescription('⚠️ **Stock agotado**');
    }

    await message.reply({ embeds: [embed] });
}

async function mostrarStock(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso correcto: `!stock [producto]`\nEjemplo: `!stock glock`');
    }

    const producto = args.join(' ').toLowerCase();
    
    if (!inventario.hasOwnProperty(producto)) {
        return message.reply(`❌ El producto "${producto}" no existe en el inventario.`);
    }

    const stock = inventario[producto];
    const color = stock === 0 ? '#dc3545' : stock < 10 ? '#ffc107' : '#28a745';
    const estado = stock === 0 ? '🔴 Agotado' : stock < 10 ? '🟡 Stock Bajo' : '🟢 Stock Normal';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('📊 Consulta de Stock')
        .addFields(
            { name: 'Producto', value: producto.charAt(0).toUpperCase() + producto.slice(1), inline: true },
            { name: 'Cantidad', value: stock.toString(), inline: true },
            { name: 'Estado', value: estado, inline: true }
        )
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function mostrarInventarioCompleto(message) {
    const productos = Object.keys(inventario);
    
    if (productos.length === 0) {
        return message.reply('📦 El inventario está vacío.');
    }

    let descripcion = '';
    let totalProductos = 0;
    let totalUnidades = 0;

    productos.sort().forEach(producto => {
        const stock = inventario[producto];
        const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${estado} **${producto.charAt(0).toUpperCase() + producto.slice(1)}**: ${stock} unidades\n`;
        totalProductos++;
        totalUnidades += stock;
    });

    const partes = dividirEmbed(descripcion);
    
    for (let i = 0; i < partes.length; i++) {
        const embed = new EmbedBuilder()
            .setColor('#17a2b8')
            .setTitle(`📋 Inventario Completo ${partes.length > 1 ? `(${i + 1}/${partes.length})` : ''}`)
            .setDescription(partes[i])
            .setTimestamp();

        if (i === partes.length - 1) {
            embed.addFields(
                { name: 'Total de Productos', value: totalProductos.toString(), inline: true },
                { name: 'Total de Unidades', value: totalUnidades.toString(), inline: true }
            );
        }

        await message.reply({ embeds: [embed] });
    }
}

async function buscarProducto(message, args) {
    if (args.length === 0) {
        return message.reply('❌ Uso correcto: `!buscar [término]`\nEjemplo: `!buscar glock`');
    }

    const termino = args.join(' ').toLowerCase();
    const productosEncontrados = Object.keys(inventario).filter(producto => 
        producto.includes(termino)
    );

    if (productosEncontrados.length === 0) {
        return message.reply(`❌ No se encontraron productos que contengan "${termino}".`);
    }

    const embed = new EmbedBuilder()
        .setColor('#6f42c1')
        .setTitle('🔍 Resultados de Búsqueda')
        .setDescription(`Productos que contienen "${termino}":`)
        .setTimestamp();

    let descripcion = '';
    productosEncontrados.forEach(producto => {
        const stock = inventario[producto];
        const estado = stock === 0 ? '🔴' : stock < 10 ? '🟡' : '🟢';
        descripcion += `${estado} **${producto.charAt(0).toUpperCase() + producto.slice(1)}**: ${stock} unidades\n`;
    });

    embed.addFields({ name: 'Productos Encontrados', value: descripcion, inline: false });

    await message.reply({ embeds: [embed] });
}

async function limpiarInventario(message) {
    const embed = new EmbedBuilder()
        .setColor('#dc3545')
        .setTitle('⚠️ Confirmar Limpieza de Inventario')
        .setDescription('¿Estás seguro de que quieres limpiar todo el inventario?\nEscribe `confirmar` para continuar o `cancelar` para abortar.')
        .setTimestamp();

    await message.reply({ embeds: [embed] });

    const filter = (response) => {
        return response.author.id === message.author.id && 
               ['confirmar', 'cancelar'].includes(response.content.toLowerCase());
    };

    try {
        const collected = await message.channel.awaitMessages({ 
            filter, 
            max: 1, 
            time: 30000, 
            errors: ['time'] 
        });

        const respuesta = collected.first().content.toLowerCase();

        if (respuesta === 'confirmar') {
            inventario = {};
            await guardarInventario();
            
            const confirmEmbed = new EmbedBuilder()
                .setColor('#28a745')
                .setTitle('✅ Inventario Limpiado')
                .setDescription('El inventario ha sido completamente limpiado y guardado.')
                .setTimestamp();
            
            await message.reply({ embeds: [confirmEmbed] });
        } else {
            await message.reply('❌ Limpieza de inventario cancelada.');
        }
    } catch (error) {
        await message.reply('⏰ Tiempo agotado. Limpieza de inventario cancelada.');
    }
}

// Prefijo para los comandos
const PREFIX = '!';

client.once('ready', async () => {
    console.log(`✅ Bot conectado como ${client.user.tag}!`);
    console.log(`🔗 ID del bot: ${client.user.id}`);
    console.log(`📊 Conectado a ${client.guilds.cache.size} servidor(es)`);
    client.user.setActivity('Gestionando inventario de la banda 🔫', { type: ActivityType.Watching });
    
    // Cargar inventario desde archivo
    await cargarInventario();
    
    // Inicializar productos básicos si es necesario
    await inicializarProductosBasicos();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const comando = args.shift().toLowerCase();

    try {
        switch (comando) {
            case 'ayuda':
            case 'help':
                await mostrarAyuda(message);
                break;

            case 'agregar':
            case 'add':
                await agregarProducto(message, args);
                break;

            case 'quitar':
            case 'remove':
                await quitarProducto(message, args);
                break;

            case 'stock':
                await mostrarStock(message, args);
                break;

            case 'inventario':
            case 'lista':
                await mostrarInventarioCompleto(message);
                break;

            case 'buscar':
            case 'search':
                await buscarProducto(message, args);
                break;

            case 'limpiar':
            case 'clear':
                await limpiarInventario(message);
                break;

            case 'categorias':
            case 'categories':
                await mostrarCategorias(message);
                break;

            case 'categoria':
            case 'category':
                await mostrarProductosCategoria(message, args);
                break;

            case 'sugerir':
            case 'suggest':
                await sugerirProductos(message, args);
                break;

            case 'crear':
            case 'create':
                await crearProductosLote(message, args);
                break;

            case 'importar':
            case 'import':
                await importarProductos(message, args);
                break;

            default:
                await message.reply('❌ Comando no reconocido. Usa `!ayuda` para ver los comandos disponibles.');
        }
    } catch (error) {
        console.error('❌ Error al procesar comando:', error);
        await message.reply('❌ Ocurrió un error al procesar el comando. Revisa la consola para más detalles.');
    }
});

client.on('error', (error) => {
    console.error('❌ Error del cliente Discord:', error);
});

client.on('warn', (info) => {
    console.warn('⚠️ Advertencia:', info);
});

// Verificar que el token está configurado
if (!DISCORD_TOKEN || DISCORD_TOKEN === 'TU_TOKEN_AQUI') {
    console.error('❌ ERROR: Debes configurar tu token de Discord');
    console.error('🔗 Ve a https://discord.com/developers/applications para obtener tu token');
    console.error('📝 Reemplaza "TU_TOKEN_AQUI" con tu token real en la línea 5');
    process.exit(1);
}

// Conectar el bot
console.log('🚀 Iniciando bot...');
client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Error al conectar el bot:', error);
    process.exit(1);
});