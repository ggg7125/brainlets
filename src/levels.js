import { socket } from './client.js'
var utils = require('../utils')
var clientUtils = require('./clientUtils')

//. ask the authority to increase the stat's level, and if you have the points it will
//* these happen when you click the UI buttons to raise the stat
export function RequestPower(){
    socket.emit(utils.msg().requestPower)
}

export function RequestDurability(){
    socket.emit(utils.msg().requestDurability)
}

export function RequestSpeed(){
    socket.emit(utils.msg().requestSpeed)
}

export function RequestStamina(){
    socket.emit(utils.msg().requestStamina)
}

export function RequestVitality(){
    socket.emit(utils.msg().requestVitality)
}

export function RequestSpirit(){
    socket.emit(utils.msg().requestSpirit)
}

//. authority listens for requests to increase stat levels
setTimeout(function(){
    socket.on(utils.msg().requestPower, function(data){
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        s.TryStatLevel('powerStat')
    })
    socket.on(utils.msg().requestDurability, function(data){
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        s.TryStatLevel('durabilityStat')
    })
    socket.on(utils.msg().requestSpeed, function(data){
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        s.TryStatLevel('speedStat')
    })
    socket.on(utils.msg().requestStamina, function(data){
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        s.TryStatLevel('staminaStat')
    })
    socket.on(utils.msg().requestVitality, function(data){
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        s.TryStatLevel('vitalityStat')
    })
    socket.on(utils.msg().requestSpirit, function(data){
        let playerSlot = data
        let s = clientUtils.GetPlayerBySlot(playerSlot)
        if(!s) return
        s.TryStatLevel('spiritStat')
    })
}, 10)