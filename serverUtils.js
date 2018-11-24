//. Utilities that only work on the server, that literally would not even work on the client if we wanted

const server = require('./server')
const utils = require('./utils')

module.exports = {
    GetSocketsInRangeOf: GetSocketsInRangeOf,
}

function GetSocketsInRangeOf(range, x, y, room){
    let returns = []
    for(var socket of room.clients){
        if(socket.x == undefined || socket.y == undefined) continue
        if(utils.Distance(x, y, socket.x, socket.y) <= range) returns.push(socket)
    }
    return returns
}