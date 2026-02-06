/**
 * Lumière Patisserie Discord Bot
 * ================================
 * Handles preorder and wholesale order management.
 * Orders are posted directly to output channels and optionally added to Google Calendar.
 */

require('dotenv').config({ quiet: true });

const {
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

// Date parsing library
const chrono = require('chrono-node');

// Google Calendar API
const { google } = require('googleapis');

// ===========================================
// CONFIGURATION
// ===========================================

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds] 
});

// Channel IDs from .env
const CHANNELS = {
  preorderIntake: process.env.PREORDER_INTAKE_CHANNEL_ID,
  preorderOutput: process.env.PREORDER_OUTPUT_CHANNEL_ID,
  wholesaleIntake: process.env.WHOLESALE_INTAKE_CHANNEL_ID,
  wholesaleOutput: process.env.WHOLESALE_OUTPUT_CHANNEL_ID,
};

// Google Calendar configuration
const GOOGLE_CALENDAR_ENABLED = process.env.GOOGLE_CALENDAR_ENABLED === 'true';
const GOOGLE_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const GOOGLE_KEY_FILE = process.env.GOOGLE_KEY_FILE || 'lumiere-bot-486622-3c8669e3b5cf.json';

// Initialize Google Calendar client
let calendar = null;
if (GOOGLE_CALENDAR_ENABLED) {
  try {
    const path = require('path');
    const fs = require('fs');
    
    // Method 1: Use environment variables (for Railway/cloud hosting)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
      calendar = google.calendar({ version: 'v3', auth });
      console.log('✅ Google Calendar connected (via env vars)');
    }
    // Method 2: Use JSON key file (for local development)
    else {
      const keyFilePath = path.join(__dirname, GOOGLE_KEY_FILE);
      if (fs.existsSync(keyFilePath)) {
        const auth = new google.auth.GoogleAuth({
          keyFile: keyFilePath,
          scopes: ['https://www.googleapis.com/auth/calendar'],
        });
        calendar = google.calendar({ version: 'v3', auth });
        console.log('✅ Google Calendar connected (via key file)');
      } else {
        console.log('⚠️ Google Calendar: No credentials found (key file or env vars)');
      }
    }
  } catch (error) {
    console.error('❌ Google Calendar setup failed:', error.message);
  }
}

// Modal IDs
const MODAL_IDS = {
  preorder: 'modal_preorder',
  wholesale_tova: 'modal_wholesale_tova',
  wholesale_lumiere: 'modal_wholesale_lumiere',
  wholesale_both: 'modal_wholesale_both',
};

// Simple order counter (resets on bot restart - use database for persistence)
let orderCounter = {
  preorder: 1,
  wholesale: 1,
};

// Track the last date to reset counters at midnight
let lastOrderDate = new Date().toDateString();

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function generateOrderId(type) {
  const prefix = type === 'preorder' ? 'pre' : 'who';
  const date = new Date();
  
  // Reset counters if it's a new day
  const today = date.toDateString();
  if (today !== lastOrderDate) {
    orderCounter.preorder = 1;
    orderCounter.wholesale = 1;
    lastOrderDate = today;
  }
  
  // Format: pre261, who261 (type + month + day + number)
  const month = date.getMonth() + 1;  // 1-12
  const day = date.getDate();          // 1-31
  const num = orderCounter[type]++;
  
  return `${prefix}${month}${day}${num}`;
}

// Parse natural language date into a Date object
function parseDate(dateString) {
  if (!dateString) return null;
  
  // Use chrono to parse the date
  const parsed = chrono.parseDate(dateString, new Date(), { forwardDate: true });
  return parsed;
}

// Create a Google Calendar event
async function createCalendarEvent(orderType, orderId, data, parsedDate) {
  if (!calendar || !GOOGLE_CALENDAR_ENABLED) return null;
  
  try {
    // Build event title
    let title = '';
    if (orderType === 'preorder') {
      title = `📦 PRE-ORDER: ${data.customer} (${orderId})`;
    } else {
      title = `🏷️ WHOLESALE: ${data.business} (${orderId})`;
    }
    
    // Build event description
    let description = '';
    if (orderType === 'preorder') {
      description = `Order ID: ${orderId}\n`;
      description += `Customer: ${data.customer}\n`;
      if (data.phone) description += `Phone: ${data.phone}\n`;
      description += `Payment: ${data.paid}\n`;
      description += `\nItems:\n${data.items}`;
    } else {
      description = `Order ID: ${orderId}\n`;
      description += `Business: ${data.business}\n`;
      description += `Kitchen: ${data.kitchen}\n`;
      description += `\nItems:\n`;
      if (data.kitchen === 'BOTH') {
        description += `TOVA:\n${data.itemsTova}\n\nLUMIERE:\n${data.itemsLumiere}`;
      } else {
        description += data.items;
      }
      if (data.notes) description += `\n\nNotes: ${data.notes}`;
    }
    
    // Create event object
    const event = {
      summary: title,
      description: description,
    };
    
    // Set date/time
    if (parsedDate) {
      // Check if time was specified (if hours/minutes are not 12:00 or 00:00)
      const hasTime = parsedDate.getHours() !== 12 && parsedDate.getHours() !== 0;
      
      if (hasTime) {
        // Event with specific time (1 hour duration)
        const endDate = new Date(parsedDate.getTime() + 60 * 60 * 1000);
        event.start = { dateTime: parsedDate.toISOString(), timeZone: 'America/Toronto' };
        event.end = { dateTime: endDate.toISOString(), timeZone: 'America/Toronto' };
      } else {
        // All-day event
        const dateStr = parsedDate.toISOString().split('T')[0];
        event.start = { date: dateStr };
        event.end = { date: dateStr };
      }
    } else {
      // No date parsed, use today as all-day event
      const today = new Date().toISOString().split('T')[0];
      event.start = { date: today };
      event.end = { date: today };
    }
    
    // Create the event
    const response = await calendar.events.insert({
      calendarId: GOOGLE_CALENDAR_ID,
      resource: event,
    });
    
    // Return both the link and event ID for deletion later
    return {
      link: response.data.htmlLink,
      eventId: response.data.id,
    };
  } catch (error) {
    console.error('Error creating calendar event:', error.message);
    return null;
  }
}

// Delete a Google Calendar event
async function deleteCalendarEvent(eventId) {
  if (!calendar || !GOOGLE_CALENDAR_ENABLED || !eventId) return false;
  
  try {
    await calendar.events.delete({
      calendarId: GOOGLE_CALENDAR_ID,
      eventId: eventId,
    });
    return true;
  } catch (error) {
    console.error('Error deleting calendar event:', error.message);
    return false;
  }
}

function createPreorderEmbed(data, orderId, calendarEventId = null) {
  const fields = [
    { name: '👤 Customer', value: data.customer, inline: true },
    { name: '💳 Payment', value: data.paid, inline: true },
  ];

  // Add phone if provided
  if (data.phone) {
    fields.push({ name: '📞 Phone', value: data.phone, inline: true });
  }

  // Add pickup if provided
  if (data.pickup) {
    fields.push({ name: '📅 Pickup', value: data.pickup, inline: true });
  }

  fields.push({ name: '🛒 Items', value: data.items, inline: false });

  // Include calendar event ID in footer if available
  let footerText = `Submitted by ${data.submittedBy}`;
  if (calendarEventId) {
    footerText += ` | cal:${calendarEventId}`;
  }

  return new EmbedBuilder()
    .setColor(0x00FF00)  // Green
    .setTitle(`🧾 PRE-ORDER`)
    .setDescription(`**Order ID:** \`${orderId}\``)
    .addFields(fields)
    .setFooter({ text: footerText })
    .setTimestamp();
}

function createWholesaleEmbed(data, orderId, calendarEventId = null) {
  const fields = [
    { name: '🏢 Business', value: data.business, inline: true },
    { name: '🏭 Kitchen', value: data.kitchen, inline: true },
    { name: '📅 Delivery Day', value: data.delivery, inline: true },
  ];

  // Handle BOTH kitchen case with separate item fields
  if (data.kitchen === 'BOTH') {
    if (data.itemsTova) {
      fields.push({ name: '🛒 Items (TOVA)', value: data.itemsTova, inline: false });
    }
    if (data.itemsLumiere) {
      fields.push({ name: '🛒 Items (LUMIERE)', value: data.itemsLumiere, inline: false });
    }
  } else {
    fields.push({ name: '🛒 Items', value: data.items, inline: false });
  }

  // Add notes if provided
  if (data.notes) {
    fields.push({ name: '📝 Notes', value: data.notes, inline: false });
  }

  // Include calendar event ID in footer if available
  let footerText = `Submitted by ${data.submittedBy}`;
  if (calendarEventId) {
    footerText += ` | cal:${calendarEventId}`;
  }

  return new EmbedBuilder()
    .setColor(0x00FF00)  // Green
    .setTitle(`🏷️ WHOLESALE (${data.business})`)
    .setDescription(`**Order ID:** \`${orderId}\`\n**Kitchen:** ${data.kitchen}`)
    .addFields(fields)
    .setFooter({ text: footerText })
    .setTimestamp();
}

// Helper function to submit wholesale orders
async function submitWholesaleOrder(interaction, orderId, orderData) {
  // Parse the delivery date for calendar
  const parsedDate = parseDate(orderData.delivery);

  try {
    // Create calendar event FIRST so we can store the ID in the embed
    let calendarResult = null;
    if (GOOGLE_CALENDAR_ENABLED && parsedDate) {
      calendarResult = await createCalendarEvent('wholesale', orderId, orderData, parsedDate);
    }

    const outputChannel = await client.channels.fetch(CHANNELS.wholesaleOutput);
    const embed = createWholesaleEmbed(orderData, orderId, calendarResult?.eventId);

    await outputChannel.send({
      content: `📥 **New wholesale order from** <@${interaction.user.id}>`,
      embeds: [embed],
    });

    let replyContent = `✅ Wholesale order submitted!\n**Order ID:** \`${orderId}\``;
    if (calendarResult) {
      replyContent += `\n📅 Added to calendar`;
    } else if (GOOGLE_CALENDAR_ENABLED && !parsedDate && orderData.delivery) {
      replyContent += `\n⚠️ Could not parse date "${orderData.delivery}" for calendar`;
    }

    return interaction.reply({
      content: replyContent,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error posting wholesale order:', error);
    return interaction.reply({
      content: `❌ Error submitting order. Check bot permissions.`,
      ephemeral: true
    });
  }
}

// Create wholesale modal for TOVA kitchen
function createWholesaleModalTova() {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.wholesale_tova)
    .setTitle('Wholesale Order (TOVA)');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('business')
        .setLabel('Business Code')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('delivery')
        .setLabel('Delivery Day')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items')
        .setLabel('Items + Quantity')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );

  return modal;
}

// Create wholesale modal for LUMIERE kitchen
function createWholesaleModalLumiere() {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.wholesale_lumiere)
    .setTitle('Wholesale Order (LUMIERE)');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('business')
        .setLabel('Business Code')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('delivery')
        .setLabel('Delivery Day')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items')
        .setLabel('Items + Quantity')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );

  return modal;
}

// Create wholesale modal for BOTH kitchens
function createWholesaleModalBoth() {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_IDS.wholesale_both)
    .setTitle('Wholesale Order (BOTH)');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('business')
        .setLabel('Business Code')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('delivery')
        .setLabel('Delivery Day')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items_tova')
        .setLabel('Items + Quantity (TOVA)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('items_lumiere')
        .setLabel('Items + Quantity (LUMIERE)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    )
  );

  return modal;
}

// ===========================================
// SLASH COMMAND HANDLERS
// ===========================================

client.on('interactionCreate', async (interaction) => {
  // -----------------------------------------
  // SLASH COMMANDS → Show Modal Forms
  // -----------------------------------------
  if (interaction.isChatInputCommand()) {
    
    // /preorder command
    if (interaction.commandName === 'preorder') {
      const modal = new ModalBuilder()
        .setCustomId(MODAL_IDS.preorder)
        .setTitle('Lumière Pre-Order');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('customer')
            .setLabel('Customer Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('phone')
            .setLabel('Phone Number (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('pickup')
            .setLabel('Pickup Date/Time (optional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('items')
            .setLabel('Items + Special Instructions')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('paid')
            .setLabel('Payment Status')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    // /wholesale command - show kitchen selection buttons
    if (interaction.commandName === 'wholesale') {
      const tovaButton = new ButtonBuilder()
        .setCustomId('wholesale_kitchen_tova')
        .setLabel('TOVA')
        .setStyle(ButtonStyle.Primary);

      const lumiereButton = new ButtonBuilder()
        .setCustomId('wholesale_kitchen_lumiere')
        .setLabel('LUMIERE')
        .setStyle(ButtonStyle.Primary);

      const bothButton = new ButtonBuilder()
        .setCustomId('wholesale_kitchen_both')
        .setLabel('BOTH')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder().addComponents(tovaButton, lumiereButton, bothButton);

      return interaction.reply({
        content: '🏭 **Select Kitchen Location:**',
        components: [row],
        ephemeral: true,
      });
    }

    // /delete command - find and confirm deletion
    if (interaction.commandName === 'delete') {
      const orderId = interaction.options.getString('order_id').toLowerCase();
      
      await interaction.deferReply({ ephemeral: true });

      try {
        // Determine which channel to search based on order ID prefix
        let channelId;
        let orderType;
        if (orderId.startsWith('pre')) {
          channelId = CHANNELS.preorderOutput;
          orderType = 'Preorder';
        } else if (orderId.startsWith('who')) {
          channelId = CHANNELS.wholesaleOutput;
          orderType = 'Wholesale';
        } else {
          return interaction.editReply({
            content: `❌ Invalid order ID format. Start with \`pre\` or \`who\` (e.g., pre261, who261)`,
          });
        }

        const channel = await client.channels.fetch(channelId);
        
        // Search recent messages for the order ID
        const messages = await channel.messages.fetch({ limit: 100 });
        const orderMessage = messages.find(msg => 
          msg.embeds.length > 0 && 
          msg.embeds[0].description?.includes(orderId)
        );

        if (!orderMessage) {
          return interaction.editReply({
            content: `❌ Order \`${orderId}\` not found.\n\nMake sure the order ID is correct and the order hasn't been deleted already.`,
          });
        }

        // Extract order details from embed
        const embed = orderMessage.embeds[0];
        
        // Create confirmation embed
        const confirmEmbed = new EmbedBuilder()
          .setTitle(`🗑️ Delete ${orderType}?`)
          .setDescription(`**Order ID:** \`${orderId}\``)
          .setColor(0xFF6B6B)
          .setTimestamp();

        // Add fields from original embed
        if (embed.fields) {
          embed.fields.forEach(field => {
            confirmEmbed.addFields({ name: field.name, value: field.value, inline: field.inline });
          });
        }

        // Create confirm/cancel buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId(`delete_confirm_${orderMessage.id}`)
          .setLabel('Yes, Delete')
          .setStyle(ButtonStyle.Danger);

        const cancelButton = new ButtonBuilder()
          .setCustomId('delete_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

        return interaction.editReply({
          content: `⚠️ **Are you sure you want to delete this order?**`,
          embeds: [confirmEmbed],
          components: [row],
        });

      } catch (error) {
        console.error('Error searching for order:', error);
        return interaction.editReply({
          content: `❌ Error searching for order. Check bot permissions.`,
        });
      }
    }

  }

  // -----------------------------------------
  // MODAL SUBMISSIONS → Post to Intake Channel
  // -----------------------------------------
  if (interaction.isModalSubmit()) {
    
    // Preorder form submitted
    if (interaction.customId === MODAL_IDS.preorder) {
      const orderId = generateOrderId('preorder');
      
      const orderData = {
        customer: interaction.fields.getTextInputValue('customer'),
        phone: interaction.fields.getTextInputValue('phone') || '',
        pickup: interaction.fields.getTextInputValue('pickup') || '',
        items: interaction.fields.getTextInputValue('items'),
        paid: interaction.fields.getTextInputValue('paid'),
        submittedBy: interaction.user.username,
      };

      // Parse the pickup date for calendar
      const parsedDate = parseDate(orderData.pickup);

      try {
        // Create calendar event FIRST so we can store the ID in the embed
        let calendarResult = null;
        if (GOOGLE_CALENDAR_ENABLED && parsedDate) {
          calendarResult = await createCalendarEvent('preorder', orderId, orderData, parsedDate);
        }

        const outputChannel = await client.channels.fetch(CHANNELS.preorderOutput);
        const embed = createPreorderEmbed(orderData, orderId, calendarResult?.eventId);

        await outputChannel.send({
          content: `📥 **New preorder from** <@${interaction.user.id}>`,
          embeds: [embed],
        });

        let replyContent = `✅ Preorder submitted!\n**Order ID:** \`${orderId}\``;
        if (calendarResult) {
          replyContent += `\n📅 Added to calendar`;
        } else if (GOOGLE_CALENDAR_ENABLED && !parsedDate && orderData.pickup) {
          replyContent += `\n⚠️ Could not parse date "${orderData.pickup}" for calendar`;
        }

        return interaction.reply({
          content: replyContent,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error posting preorder:', error);
        return interaction.reply({
          content: `❌ Error submitting preorder. Check bot permissions.`,
          ephemeral: true
        });
      }
    }

    // Wholesale TOVA form submitted
    if (interaction.customId === MODAL_IDS.wholesale_tova) {
      const orderId = generateOrderId('wholesale');
      
      const orderData = {
        business: interaction.fields.getTextInputValue('business').toUpperCase(),
        kitchen: 'TOVA',
        delivery: interaction.fields.getTextInputValue('delivery'),
        items: interaction.fields.getTextInputValue('items'),
        notes: interaction.fields.getTextInputValue('notes') || '',
        submittedBy: interaction.user.username,
      };

      return await submitWholesaleOrder(interaction, orderId, orderData);
    }

    // Wholesale LUMIERE form submitted
    if (interaction.customId === MODAL_IDS.wholesale_lumiere) {
      const orderId = generateOrderId('wholesale');
      
      const orderData = {
        business: interaction.fields.getTextInputValue('business').toUpperCase(),
        kitchen: 'LUMIERE',
        delivery: interaction.fields.getTextInputValue('delivery'),
        items: interaction.fields.getTextInputValue('items'),
        notes: interaction.fields.getTextInputValue('notes') || '',
        submittedBy: interaction.user.username,
      };

      return await submitWholesaleOrder(interaction, orderId, orderData);
    }

    // Wholesale BOTH form submitted
    if (interaction.customId === MODAL_IDS.wholesale_both) {
      const orderId = generateOrderId('wholesale');
      
      const orderData = {
        business: interaction.fields.getTextInputValue('business').toUpperCase(),
        kitchen: 'BOTH',
        delivery: interaction.fields.getTextInputValue('delivery'),
        itemsTova: interaction.fields.getTextInputValue('items_tova'),
        itemsLumiere: interaction.fields.getTextInputValue('items_lumiere'),
        notes: interaction.fields.getTextInputValue('notes') || '',
        submittedBy: interaction.user.username,
      };

      return await submitWholesaleOrder(interaction, orderId, orderData);
    }
  }

  // -----------------------------------------
  // BUTTON CLICKS → Kitchen Selection & Delete Confirmation
  // -----------------------------------------
  if (interaction.isButton()) {
    // Handle wholesale kitchen selection buttons
    if (interaction.customId === 'wholesale_kitchen_tova') {
      return interaction.showModal(createWholesaleModalTova());
    }
    if (interaction.customId === 'wholesale_kitchen_lumiere') {
      return interaction.showModal(createWholesaleModalLumiere());
    }
    if (interaction.customId === 'wholesale_kitchen_both') {
      return interaction.showModal(createWholesaleModalBoth());
    }

    // Handle delete cancel button
    if (interaction.customId === 'delete_cancel') {
      return interaction.update({
        content: '❌ Deletion cancelled.',
        embeds: [],
        components: [],
      });
    }

    // Handle delete confirm button
    if (interaction.customId.startsWith('delete_confirm_')) {
      const messageId = interaction.customId.replace('delete_confirm_', '');
      
      try {
        // Try to find and delete the message in preorder output
        let deleted = false;
        let deletedOrderId = '';
        let calendarEventId = null;
        let calendarDeleted = false;
        
        try {
          const preorderChannel = await client.channels.fetch(CHANNELS.preorderOutput);
          const msg = await preorderChannel.messages.fetch(messageId);
          // Extract order ID from description (format: **Order ID:** `pre261`)
          const orderMatch = msg.embeds[0]?.description?.match(/`((?:pre|who)\d+)`/i);
          if (orderMatch) deletedOrderId = orderMatch[1];
          // Extract calendar event ID from footer (format: Submitted by xxx | cal:eventId)
          const calMatch = msg.embeds[0]?.footer?.text?.match(/cal:([a-zA-Z0-9_-]+)/);
          if (calMatch) calendarEventId = calMatch[1];
          await msg.delete();
          deleted = true;
        } catch (e) {
          // Message not in preorder channel, try wholesale
        }
        
        if (!deleted) {
          try {
            const wholesaleChannel = await client.channels.fetch(CHANNELS.wholesaleOutput);
            const msg = await wholesaleChannel.messages.fetch(messageId);
            // Extract order ID from description (format: **Order ID:** `who261`)
            const orderMatch = msg.embeds[0]?.description?.match(/`((?:pre|who)\d+)`/i);
            if (orderMatch) deletedOrderId = orderMatch[1];
            // Extract calendar event ID from footer (format: Submitted by xxx | cal:eventId)
            const calMatch = msg.embeds[0]?.footer?.text?.match(/cal:([a-zA-Z0-9_-]+)/);
            if (calMatch) calendarEventId = calMatch[1];
            await msg.delete();
            deleted = true;
          } catch (e) {
            // Message not found in either channel
          }
        }

        // Delete from Google Calendar if event ID was found
        if (calendarEventId) {
          calendarDeleted = await deleteCalendarEvent(calendarEventId);
        }

        if (deleted) {
          let message = `✅ Order \`${deletedOrderId}\` has been deleted.`;
          if (calendarDeleted) {
            message += `\n📅 Removed from Google Calendar`;
          }
          return interaction.update({
            content: message,
            embeds: [],
            components: [],
          });
        } else {
          return interaction.update({
            content: `❌ Could not delete order. It may have already been deleted.`,
            embeds: [],
            components: [],
          });
        }
      } catch (error) {
        console.error('Error deleting order:', error);
        return interaction.update({
          content: `❌ Error deleting order. Check bot permissions.`,
          embeds: [],
          components: [],
        });
      }
    }
  }
});

// ===========================================
// BOT STARTUP
// ===========================================

client.once('clientReady', () => {
  console.log('');
  console.log('========================================');
  console.log('  🥐 Lumière Patisserie Bot Online!');
  console.log('========================================');
  console.log(`  Logged in as: ${client.user.tag}`);
  console.log('');
  console.log('  Commands available:');
  console.log('    /preorder  - Submit customer preorder');
  console.log('    /wholesale - Submit wholesale order');
  console.log('    /delete    - Delete an order by ID');
  console.log('');
  console.log('  Orders are posted directly to output channels.');
  if (GOOGLE_CALENDAR_ENABLED) {
    console.log('  📅 Google Calendar: ENABLED');
  } else {
    console.log('  📅 Google Calendar: DISABLED');
  }
  console.log('========================================');
  console.log('');
});

// Validate env before starting
const requiredChannels = [
  'PREORDER_INTAKE_CHANNEL_ID',
  'PREORDER_OUTPUT_CHANNEL_ID', 
  'WHOLESALE_INTAKE_CHANNEL_ID',
  'WHOLESALE_OUTPUT_CHANNEL_ID'
];

for (const channel of requiredChannels) {
  if (!process.env[channel] || process.env[channel].includes('PASTE_')) {
    console.error(`❌ Error: ${channel} is not set in .env file`);
    process.exit(1);
  }
}

client.login(process.env.DISCORD_TOKEN);
