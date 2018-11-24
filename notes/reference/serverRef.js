/*
! we are now committed to the relay model. if you want to remember why, go to the folder we were originally making authoritive and read the text file there with the breakdown of each model and you will again see why we HAVE to choose the relay model. commit to it.
*/

/*
//. HERE IS AN EXAMPLE OF HAVING BOTH AND HTTP AND HTTPS SERVER TO CONNECT TO
var fs = require('fs');
var http = require('http');
var https = require('https');
var privateKey  = fs.readFileSync('sslcert/server.key', 'utf8');
var certificate = fs.readFileSync('sslcert/server.crt', 'utf8');

var credentials = {key: privateKey, cert: certificate};
var express = require('express');
var app = express();

// your express configuration here

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(8080);
httpsServer.listen(8443);
*/

/*
//. ZEEX SHOWED ME THIS CODE OF HIS
const express= require('express');
const WebSocket = require('uws').Server;
const EventLite = require("event-lite");
const sp = require('./schemapackserver');
const path = require('path');
const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');
const server = express()
  .use((req, res) => res.sendFile(INDEX) )
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));
const WebsocketServer = new WebSocket({ server });
*/

var players = {} //socketId : {playerData} perhaps?

//* express portion
const express = require('express')
const app = express()

app.use(express.static('public')) //what directory to use for static resources to send to the client i think, scripts, images, index.html etc
//? app.use(express.static(__dirname + '/public'));

//i dont know what this is but it has something to do with GET, aka: GET & POST. req, res = request, response
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html')
})

//process.env.PORT is related to deploying on heroku
var server = app.listen(process.env.PORT || 8888, function(){
    let host = server.address().address
    let port = server.address().port
    console.log("listening on" + host + ":" + port)
})

//* websocket portion
//. remember that socket.io has room functionality
// using socket.volatile.emit() instead of socket.emit() according to docs sends a message without any care if it was received or not
var io = require('socket.io')(server)

io.sockets.on("connection", function(socket){
    console.log(`new client with id = ${socket.id}`)
    players[socket.id] = {
        x: 0,
        y: 0,
    }
    socket.emit('playerList', players) //send the client the player list for example
    socket.broadcast.emit('newPlayer', players[socket.id]) //inform all other players of the new player
    
    socket.on('disconnect', function(){
        console.log("a client disconnected")
        delete players[socket.id]
        io.emit('disconnect', socket.id) //tell all other players to remove this player
    })

    socket.on('newPlayer', function(){
        console.log('new player')
        io.emit('newPlayer')
    })
})