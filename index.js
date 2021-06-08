const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require("node-fetch");
const app = express();
const PORT = process.env.PORT || 5000;

const apiKeys = [
  "8005261d-3361-4dd5-8b6b-4ff540e046d9",
  "e4100c12-561d-42fb-a283-9ad3a99a253f",
  "b4d65bec-3daa-4480-8293-12a1603795cd",
  "1855d63c-5d02-4016-8e10-c6af9f1c3cf8",
  "c68058da-68d7-449f-8e9b-dfe59ca14a40"
]
let keyToUse = 0;

app.use(express.static(path.join(__dirname, 'public')))
app.get('/crypto', (req, res) => {
    let cryptoList = readObjectFromFile('crypto.json');
    let cryptoId = req.query.id;
    if (cryptoId == null) {
      res.send(JSON.stringify(cryptoList));
    } else {
      let index = getCryptoIndex(cryptoId, cryptoList.data);
      let crypto = cryptoList.data[index];
      res.send(JSON.stringify(crypto));
    }
    
})
app.get('/loginOrRegister', (req, res) => {
  let loginStatus = userRegisterOrLogin(req.query.username, req.query.password);
  res.send(JSON.stringify(loginStatus));
})
app.get('/wallet', (req, res) => {
  let wallet = getWallet(req.query.username);
  res.send(JSON.stringify(wallet));
})
app.get('/leaderboard', (req, res) => {
  let leaderboard = readObjectFromFile('leaderboard.json');
  res.send(JSON.stringify(leaderboard));
})
app.get('/sell', (req, res) => {
  let success = sellCrypto(req.query.username, req.query.cryptoId, req.query.amount);
  let answer = {
    success: success
  }
  res.send(JSON.stringify(answer));
})
app.get('/buy', (req, res) => {
  let success = buyCrypto(req.query.username, req.query.cryptoId, req.query.amount);
  let answer = {
    success: success
  }
  res.send(JSON.stringify(answer));
})
app.listen(PORT, () => console.log(`Listening on ${ PORT }`));

initServer();

/**
 * Function called when the server wakes up.
 * It will set a timer to load crypocurrencies from CoinMarketCap API every minute.
 */
function initServer() {
  loadCrypto();
  setInterval(loadCrypto, 1*60*1000);
  if (!fs.existsSync('users.json')) {
    writeObjectToFile('users.json', { data: [] });
  }
  if (!fs.existsSync('crypto.json')) {
    writeObjectToFile('crypto.json', { data: [] });
  }
  update7dHistory();
  // 7d history is update every 168 minutes -> 60 points over 7 days
  setInterval(update7dHistory, 168*60*1000);
}

function loadCrypto() {
  const apiKey = apiKeys[keyToUse++];
  if (keyToUse >= apiKeys.length) {
    keyToUse = 0;
  }
  const cmcUrl = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?limit=200";
  const request = async () => {
    const response = await fetch(cmcUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-CMC_PRO_API_KEY': apiKey
      }
    });
    const data = await response.json();
    extractCrypto(data);
  }
  request();
}

/**
 * Write a JSON Object in a json file
 * @param {String} filename 
 * @param {Object} jsonObject 
 */
function writeObjectToFile(filename, jsonObject) {
  const jsonString = JSON.stringify(jsonObject, null, 4);
  fs.writeFileSync(filename, jsonString);
  console.log(filename + " updated.");
} 

function readObjectFromFile(filename) {
  let data = fs.readFileSync(filename, 'utf-8');
  return JSON.parse(data);
} 
  
function extractCrypto(research) {
  let cryptoList = new Object();
  cryptoList.data = [];
  try {
    cryptoList = readObjectFromFile('crypto.json');
  } catch(err) {
    console.log(err);
  }  
  for(let i = 0; i < research.data.length; i++) {
    let crypto = research.data[i];
    let cryptoIndex = getCryptoIndex(crypto.id, cryptoList.data);
    if (cryptoIndex == -1) {
      cryptoList.data.push({
        id: crypto.id,
        name: crypto.name,
        symbol: crypto.symbol,
        price: crypto.quote.USD.price,
        history_1h: [{
          timestamp: crypto.last_updated,
          value: crypto.quote.USD.price
        }],
        history_7d: [],
        percentChange1h: crypto.quote.USD.percent_change_1h,
        percentChange24h: crypto.quote.USD.percent_change_24h,
        percentChange7d: crypto.quote.USD.percent_change_7d,
        percentChange30d: crypto.quote.USD.percent_change_30d,
        percentChange60d: crypto.quote.USD.percent_change_60d,
        percentChange90d: crypto.quote.USD.percent_change_90d
      })
    } else {
      let cryptoToUpdate = cryptoList.data[cryptoIndex];
      cryptoToUpdate.price = crypto.quote.USD.price;
      cryptoToUpdate.history_1h.unshift({
        timestamp: crypto.last_updated,
        value: crypto.quote.USD.price
      });
      cryptoToUpdate.percentChange1h = crypto.quote.USD.percent_change_1h;
      cryptoToUpdate.percentChange24h = crypto.quote.USD.percent_change_24h;
      cryptoToUpdate.percentChange7d = crypto.quote.USD.percent_change_7d;
      cryptoToUpdate.percentChange30d = crypto.quote.USD.percent_change_30d;
      cryptoToUpdate.percentChange60d = crypto.quote.USD.percent_change_60d;
      cryptoToUpdate.percentChange90d = crypto.quote.USD.percent_change_90d;
      while (cryptoToUpdate.history_1h.length > 60) {
        cryptoToUpdate.history_1h.pop();
      }
    }
  }
  writeObjectToFile('crypto.json', cryptoList);
  updateWallets(cryptoList.data[0].history_1h[0].timestamp);
}

function getCryptoIndex(id, cryptoList) {
  for (let i = 0; i < cryptoList.length; i++) {
    if (cryptoList[i].id == id) {
      return i;
    }
  }
  return -1;
}

function getCrypto(id, cryptoList) {
  for (let i = 0; i < cryptoList.length; i++) {
    if (cryptoList[i].id == id) {
      return cryptoList[i];
    }
  }
}

/**
 * Register a new user if the username is not known, otherwise check if the password match the username
 * @param {String} username 
 * @param {String} pwd 
 * @returns return true if register or login went successful, false if username already exists but password doesn't match
 */
function userRegisterOrLogin(username, pwd) {
  let loginStatus = new Object();
  loginStatus.username = username;
  let users = new Object();
  users.data = [];
  try {
    users = readObjectFromFile('users.json');
  } catch(err) {
    console.log(err);
  } 
  let userIndex = getUserIndex(username, users.data);
  if (userIndex == -1) {
    users.data.push({
      username: username,
      password: pwd,
      wallet: {
        USD: 10,
        crypto: [],
        history_1h: [{
          timestamp: (new Date()).toISOString(),
          value: 10
        }],
        history_7d: [],
        transactions: []
      }
    })
    writeObjectToFile('users.json', users);
    loginStatus.isLoggedIn = true;
  } else {
    let user = users.data[userIndex];
    if (user.password === pwd) {
      loginStatus.isLoggedIn = true;
    } else {
      loginStatus.isLoggedIn = false;
    }
  }
  return loginStatus;
}

function getWallet(username) {
  let users = new Object();
  users.data = [];
  try {
    users = readObjectFromFile('users.json');
  } catch(err) {
    console.log(err);
  } 
  let userIndex = getUserIndex(username, users.data);
  if (userIndex != -1) {
    return users.data[userIndex].wallet;
  }

}

function getUserIndex(username, userList) {
  for (let i = 0; i < userList.length; i++) {
    if (userList[i].username == username) {
      return i;
    }
  }
  return -1;
}


function updateWallets(timestamp) {
  let cryptoList = readObjectFromFile('crypto.json');
  let users = readObjectFromFile('users.json');
  let leaderboard = {
    data: []
  }
  for (let i = 0; i < users.data.length; i++) {
    let wallet = users.data[i].wallet;
    let total = wallet.USD;
    for (let j = 0; j < wallet.crypto.length; j++) {
      let crypto = wallet.crypto[j];
      let index = getCryptoIndex(crypto.id, cryptoList.data);
      let price = cryptoList.data[index].price;
      let amount = crypto.amount;
      total += amount * price;
    }
    wallet.history_1h.unshift({
      timestamp: timestamp,
      value: total
    })
    while (wallet.history_1h.length > 60) {
      wallet.history_1h.pop();
    }
    leaderboard.data.push({
      username: users.data[i].username,
      usd: total
    })
  }
  writeObjectToFile('users.json', users);
  writeObjectToFile('leaderboard.json', leaderboard);
}

function update7dHistory() {
  let cryptoList = readObjectFromFile('crypto.json');
  let users = readObjectFromFile('users.json');
 
  for (let i = 0; i < cryptoList.data.length; i++) {
    let crypto = cryptoList.data[i];
    if (crypto.history_1h.length > 0) {
      let lastUpdate = crypto.history_1h[0];
      crypto.history_7d.unshift({
        timestamp: lastUpdate.timestamp,
        value: lastUpdate.value
      })
      while (crypto.history_7d.length > 60) {
        crypto.history_7d.pop();
      }
    }
  }

  for (let i = 0; i < users.data.length; i++) {
    let user = users.data[i];
    if (user.wallet.history_1h.length > 0) {
      let lastUpdate = user.wallet.history_1h[0];
      user.wallet.history_7d.unshift({
        timestamp: lastUpdate.timestamp,
        value: lastUpdate.value
      })
      while (user.wallet.history_7d.length > 60) {
        user.wallet.history_7d.pop();
      }
    }
  }

  writeObjectToFile('crypto.json', cryptoList);
  writeObjectToFile('users.json', users)
}

function sellCrypto(username, cryptoId, amount) {
  amount = parseFloat(amount);
  let users = readObjectFromFile('users.json');
  let userIndex = getUserIndex(username, users.data);
  let user = users.data[userIndex];

  let cryptoList = readObjectFromFile('crypto.json');
  let crypto = getCrypto(cryptoId, cryptoList.data);

  let cryptoInWallet;
  let cryptoInWalletIndex;
  for (let i = 0; i < user.wallet.crypto.length; i++) {
    if (user.wallet.crypto[i].id == cryptoId) {
      cryptoInWallet = user.wallet.crypto[i];
      cryptoInWalletIndex = i;
    }
  }

  console.log(cryptoInWallet);
  // if user doesn't have enough crypto, no transaction is performed
  if (!cryptoInWallet || cryptoInWallet.amount < amount) {
    return false;
  }
  cryptoInWallet.amount -= amount;

  // delete crypto from wallet if remaining amount is 0
  if (cryptoInWallet.amount == 0) {
    user.wallet.crypto.splice(cryptoInWalletIndex,1);
  }

  // upgrade usd in wallet
  let usd = crypto.price * amount;
  user.wallet.USD += usd;

  // add transaction
  user.wallet.transactions.unshift({
    timestamp: (new Date()).toISOString(),
    type: 'sell',
    USD: usd,
    cryptoId: cryptoId,
    amount: amount
  });

  while (user.wallet.transactions.length > 60) {
    user.wallet.transactions.pop();
  }

  writeObjectToFile('users.json', users);

  return true;
}


function buyCrypto(username, cryptoId, amount) {
  amount = parseFloat(amount);
  let users = readObjectFromFile('users.json');
  let userIndex = getUserIndex(username, users.data);
  let user = users.data[userIndex];

  let cryptoList = readObjectFromFile('crypto.json');
  let crypto = getCrypto(cryptoId, cryptoList.data);

  let usd = crypto.price * amount;

  // if user doesn't have enough money, no transaction is performed
  if (user.wallet.USD < usd) {
    return false;
  }
  user.wallet.USD -= usd;

  // add crypto in wallet
  let cryptoInWallet;
  for (let i = 0; i < user.wallet.crypto.length; i++) {
    if (user.wallet.crypto[i].id == cryptoId) {
      cryptoInWallet = user.wallet.crypto[i];
    }
  }

  // update amount and create crypto if it does not exist
  if (cryptoInWallet) {
    cryptoInWallet.amount += amount;
  } else { 
    user.wallet.crypto.push({
      "id":cryptoId,
      "amount":amount,
      "purchasingPrice":crypto.price
    });
  }

  user.wallet.transactions.unshift({
    timestamp: (new Date()).toISOString(),
    type: 'buy',
    USD: usd,
    cryptoId: cryptoId,
    amount: amount
  });

  while (user.wallet.transactions.length > 60) {
    user.wallet.transactions.pop();
  }

  writeObjectToFile('users.json', users);

  return true;
}