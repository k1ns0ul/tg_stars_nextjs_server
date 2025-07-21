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

app.post('/create-invoice', async (req : any, res : any) => {
    try {
        const { products, totalPrice, queryId, userId } = req.body;
        
        console.log('создание инвойса:', { products, totalPrice, queryId, userId });

        const invoicePayload = {
            products: products,
            userId: userId || 'unknown',
            orderId: Date.now().toString(),
            queryId: queryId
        };

        const response = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'покупка товаров',
                description: `кол-во ${products.length} товаров`,
                payload: JSON.stringify(invoicePayload), 
                provider_token: '',
                currency: 'XTR',    
                prices: [{ label: 'итого', amount: totalPrice }],
                start_parameter: "start_parameter" 
            })
        });
        
        const data = await response.json();
        
        if (!data.ok) {
            console.error('Ошибка от Telegram API:', data);
            return res.status(400).json({ 
                error: 'Ошибка создания инвойса', 
                details: data.description || 'Неизвестная ошибка' 
            });
        }
        
        res.json({ invoice_link: data.result });

    } catch (error) {
        console.error('ошибка создания инвойса:', error);
        res.status(500).json({ error: 'ошибка создания инвойса' });
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