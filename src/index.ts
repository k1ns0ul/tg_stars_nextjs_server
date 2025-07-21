import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const token = process.env.TOKEN
const webAppUrl = process.env.WEBAPPURL

if (!token) {
    throw new Error('TOKEN не найден в переменных окружения');
}

if (!webAppUrl) {
    throw new Error('webAppUrl не найден в переменных окружения');
}

const bot = new TelegramBot(token, {polling : true })


const PORT = process.env.PORT || 8000;
const app = express();
app.use(express.json());
app.use(cors());

bot.on('message', async (msg : any) => {
    const chatId = msg.chat.id
    
    const text = msg.text;

    if(text === '/start'){
        await bot.sendMessage(chatId, 'smth', {
            reply_markup: {
                keyboard: [
                    [{text: 'магазин', web_app: {url: webAppUrl}}] 
                ]
            }
        })
    }

    if(msg.web_app_data?.data){
        try {
            const data = JSON.parse(msg.web_app_data?.data)
            await bot.sendMessage(chatId, 'юзер айди' + data?.usrID)
            await bot.sendMessage(chatId, 'ордер айди' + data?.orderId)

            setTimeout( async () => {
                await bot.sendMessage(chatId, 'ордер айди' + data?.orderId)
            }, 1500)
        } catch (e) {
            console.log(e)
        }
    }

    if (msg.successful_payment) {
        try {
            const payload = JSON.parse(msg.successful_payment.invoice_payload);
            console.log('успешная оплата:', payload);
            
            await bot.sendMessage(chatId, 
                `оплата прошла успешно!\n` +
                `кол-во товаров: ${payload.products.length}\n` +
                `сумма: ${msg.successful_payment.total_amount} ⭐\n` +
                `ID транзакции: ${msg.successful_payment.telegram_payment_charge_id}`
            );
            
        } catch (e) {
            console.log('ошибка обработки платежа:', e);
            await bot.sendMessage(chatId, 'произошла ошибка при обработке платежа');
        }
    }
})

bot.on('pre_checkout_query', async (query : any) => {
    try {
        const payload = JSON.parse(query.invoice_payload);
        console.log('Pre-checkout query:', payload);
        
        await bot.answerPreCheckoutQuery(query.id, true);
    } catch (e) {
        console.log('ошибка pre-checkout:', e);
        await bot.answerPreCheckoutQuery(query.id, false, {
            error_message: 'произошла ошибка при обработке платежа'
        });
    }
});

app.post('/create-invoice', async (req, res) => {
    try {
        const { products, totalPrice, queryId, userId } = req.body;
        
        console.log('создание инвойса:', { products, totalPrice, queryId, userId });

        const shortPayload = JSON.stringify({
            orderId: Date.now().toString(),
            userId: userId || 'unknown'
        });
        
        if (Buffer.byteLength(shortPayload, 'utf8') > 128) {
            console.error('Payload слишком длинный:', Buffer.byteLength(shortPayload, 'utf8'), 'байт');
            return res.status(400).json({ error: 'Payload слишком длинный' });
        }

        const invoiceData = {
            title: 'покупка товаров', 
            description: `кол-во ${products.length} товаров`, 
            payload: shortPayload, 
            provider_token: '', 
            currency: 'XTR', 
            prices: [{ 
                label: 'итого', 
                amount: Math.floor(totalPrice)
            }]
        };

        console.log('Данные для API (строго по документации):', JSON.stringify(invoiceData, null, 2));
        console.log('Размер payload:', Buffer.byteLength(shortPayload, 'utf8'), 'байт');

        const response = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoiceData)
        });
        
        const data = await response.json();
        
        console.log('Ответ от Telegram API:');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
        
        if (!data.ok) {
            console.error('ОШИБКА от Telegram API:', data.description);
            return res.status(400).json({ 
                error: 'Ошибка создания инвойса', 
                details: data.description 
            });
        }
        
        res.json({ invoice_link: data.result });

    } catch (error : any) {
        console.error('ошибка создания инвойса:', error);
        res.status(500).json({ error: 'ошибка создания инвойса: ' + error.message });
    }
});

app.post('/web-data', async (req : any, res : any) => {
    const {queryId, usrID, orderId} = req.body 
    try {
        await bot.answerWebAppQuery(queryId, {
            type: 'article',
            id: queryId,
            title: 'успешная покупка',
            input_message_content: {message_text : 'ваш заказ оформлен!'}
        });
        return res.status(200).json({});
    } catch (e) {
        
        console.log(e)

        await bot.answerWebAppQuery(queryId, {
            type: 'article',
            id: queryId,
            title: 'неуспешная покупка',
            input_message_content: {message_text : 'не получилось оформить заказ!'}
        });
        return res.status(500).json({});
    }
})

app.listen(PORT, () => console.log('Server started on port 8000'))