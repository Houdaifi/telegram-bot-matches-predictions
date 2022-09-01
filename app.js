const TelegramBot = require('node-telegram-bot-api');
const {Builder, Browser, By, Key, until} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const screen = {width: 1920,height: 1080};
require('dotenv').config();
 
const connection = require("./db.congif");
const promisePool = connection.promise();

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAM_BOT_API;

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, {polling: true});

// Today date format yyyy-mm-dd
var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var all_commands = ['/partidos_li_majin', '/start_predections', '/edit_a_predection', '/saborat_tartib'];

var last_command = "";

// Listen for any kind of message. There are different kinds of messages.
bot.on('message', async (msg) => {
    let response = "";
    const chatId = msg.chat.id;

    // if not command message exit
    // if(!msg.entities) return

    const [year, month, day] = getMatchDate();
    let date = year + month + day;

    // all reply to command switch handle
    if(last_command !== ""){
        switch (last_command) {
            case '/start_predections':

                let predection = (msg.text).split("\n");
                

                console.log(predection);

                bot.sendMessage(chatId, `Saved, Your tawa9o3at are : \n ${predection} \n Bonne chance`);
                break;
        
            default:
                break;
        }
    }

    // Save the last command to response to it
    all_commands.includes(msg.text) ? last_command = msg.text : last_command = "";

    // all commands switch handle
    switch (msg.text) {
        case '/partidos_li_majin':

            bot.sendMessage(chatId, 'Getting games for ' + year + "-" + month + "-" + day + "...");

            await check_if_matches_already_exist(date).then((matches) => {
                if(Array.isArray(matches)){
                    for (const match of matches) {
                        response = response.concat("\n",match.game);
                    }
                }else{
                    response = matches;
                }
            });
            break;
        
        case '/start_predections':

            bot.sendMessage(chatId, 'Ok, 3amar tawa9o3at dyal ' + year + "-" + month + "-" + day + "\n"
                            + "Please respect the following format for example: \n"
                            + "8-2" + "\n" 
                            + "0-0" + "\n" 
                            + "nata2ij ghaytsjlo b tartib d partidos\n"
                            + "bach tchof partidos li kayn please check command "
                            + "/partidos_li_majin");

        default:
            break;
    }

    // send a message to the chat acknowledging receipt of their message
    // if(response == "") response = "Error please try again";
    // bot.sendMessage(chatId, response);
});

function split(str, index) {
    const result = [str.slice(0, index), str.slice(index)];
    return result;
}

function getMatchDate(){
    // Get date for next Tuesday Or Wednesday if today is not Tuesday or Wednesday
    var d = new Date();
    var dayName = days[d.getDay()];

    // If not Today is not Tuesday or Wednesday get the date of the upcoming Tuesday
    if(!["Tuesday", "Wednesday"].includes(dayName)) d.setDate(d.getDate() + (((1 + 8 - d.getDay()) % 7) || 7));
    
    let year = d.getFullYear();
    let month = d.getMonth() + 1;
    let day = d.getDate();
    if(day < 10) day = "0" + day;
    if(month < 10) month = "0" + month;

    return [year, month, day];
}

async function get_matches(date){
    var driver = new Builder().forBrowser(Browser.CHROME)
    .setChromeOptions( new chrome.Options().headless().windowSize(screen))
    .build();

    try {

        const [year, MonthAndDay] = split(date, 4);
        const [month, day] = split(MonthAndDay, 2);
        let game_date = year + "-" + month + "-" + day;

        var d = new Date(game_date);
        var dayName = days[d.getDay()];

        // If it's not Tuesday or Wednesday just exit
        if(!["Tuesday", "Wednesday"].includes(dayName)) return "No upcoming matches";
        
        await driver.manage().setTimeouts( { implicit: 0, pageLoad: 5000, script: null } );

        await driver.get(`https://www.cbssports.com/soccer/champions-league/schedule/${date}/`).catch((err)=>{return err;});

        let matches_table_xpath = '//table[@class="TableBase-table"]//tbody//tr';

        const MATCHES_TABLE = await driver.wait(until.elementLocated(By.xpath(matches_table_xpath)), 5000).catch((err)=>{return err;});
    
        if(MATCHES_TABLE instanceof Error){
            driver.quit();
            return "No upcoming matches";
        }

        let matches_count = await driver.findElements(By.xpath(matches_table_xpath), 5000);
        if(matches_count.length == 0) return "No upcoming matches";

        var all_teams = [];

        for (let i = 1; i <= matches_count.length; i++) {
            await driver.findElement(By.xpath(`//table[@class="TableBase-table"]//tbody/tr[${i}]//div[@class="TeamLogoNameLockup-name"]//span[@class="TeamName"]`), 5000)
                            .getText()
                            .then((name) => all_teams.push(name));
        }

        // Split teams by 2 and get partidos
        const perChunk = 2;   
        const matches = all_teams.reduce((resultArray, item, index) => { 
            const chunkIndex = Math.floor(index/perChunk);

            // start a new chunk
            if(!resultArray[chunkIndex]) resultArray[chunkIndex] = [];

            resultArray[chunkIndex].push(item);

            return resultArray;
        }, []);

        let all_games = [];

        for (const match of matches) {
            try {
                await promisePool.execute('INSERT INTO matches (game, entered_at, result) VALUES (?,?,?)', [match.join(" VS "), game_date ,"0-0"]);
                all_games.push({"game" : match.join(" VS ")});
            } catch (error) {
                return error.message
            }
        }

        return all_games;

    } catch (error) {
        console.log(error.message);
    }
 
}

async function check_if_matches_already_exist(date){
    
    const [year, MonthAndDay] = split(date, 4);
    const [month, day] = split(MonthAndDay, 2);
    let game_date = year + "-" + month + "-" + day;

    let [rows,fields] = await promisePool.query("SELECT game FROM matches WHERE entered_at = ?", [game_date]);
    if(rows.length == 0){
        rows = await get_matches(date);
    }

    return rows;
}