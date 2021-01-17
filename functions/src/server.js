require("dotenv").config();

import sirv from 'sirv';
import express from 'express';
import compression from 'compression';
import * as sapper from '@sapper/server';

import { discordClient } from "./discordClient";
import { encodeBigInt } from "./functions/recode";
import { getEverythingFromDiscord } from "./functions/moonscript";

const { PORT, NODE_ENV } = process.env;
const dev = NODE_ENV === 'development';

const sapperServer = express() // You can also use Express
   .use(
       compression({ threshold: 0 }),
       sirv('static', { dev }),
       sapper.middleware()
   )
   
if(dev){
        sapperServer.listen(PORT, err => {
            if (err) console.log('error', err);
        });
}

// Discord
discordClient.once('ready', () => {
    console.log('Discord bot is ready!');
});

discordClient.on("message", (message) => {
    switch (message.content) {
        case "$link":
            const serverID = BigInt(message.guild.id);
            const encodedServerID = encodeBigInt(serverID);
            const response = `https://werewolf.dev/${encodedServerID}`
            message.channel.send(response);
            break;
    }
});

discordClient.login(process.env.TOKEN);
  
export {sapperServer}