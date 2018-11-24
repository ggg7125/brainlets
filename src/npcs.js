/*
when a player joins the map, all npcs of the authority are spawned for them locally
the npcs state is updated as needed by the authority

npcs can only be created by the authority
*/

import {spawnableClasses, SetSpriteId} from './classes'
import {authority, socket} from './client'

export var allNpcs = []

export function GetAllNPCs(){
    return allNpcs
}

//the authority uses this to create an npc and it then sends out a message to everyone else to spawn that same npc
export function CreateEnemy(tag, x, y){
    if(socket.id != authority){
        console.log(`bug: non-authority attempt to create NPC. authority = ${authority}. id = ${socket.id}`)
        return
    }
    if(!x || !y){
        console.log('WARNING. CreateEnemy() called with no x/y!')
        return
    }
    let enemy = new spawnableClasses[tag]()
    enemy.setPosition(x, y)
    allNpcs.push(enemy)
    NetSpawnEnemy(enemy)
    return enemy
}

//authority tells the server to tell the clients to spawn this enemy
export function NetSpawnEnemy(e){
    if(socket.id != authority){
        console.log('bug: attempt to NetSpawnEnemy() without being the authority')
        return
    }
    socket.emit('spawnEnemy', GetEnemySendableData(e))
}

//collect whatever data is needed in a form sendable to others so they can recreate the npc on their side
export function GetEnemySendableData(e){
    return [e.className, e.spriteId, e.x, e.y]
}

//used to spawn enemies in remote locations using information from the existing npc on the authority
export function SpawnEnemyFromData(data){
    console.log('spawn enemy from data')
    let e = new spawnableClasses[data[0]]()
    e.spriteId = SetSpriteId(data[1]) //never set spriteId directly, use this function only, because of code inside it
    e.x = data[2]
    e.y = data[3]
    //console.log(`setting spriteId to ${e.spriteId} from spawn function`)
}