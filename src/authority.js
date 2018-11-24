/*
. most of the authority code is actually directly integrated in the room code and is inseperable from it, so, nothing we can do about that. check both places for authority code.
. but what we can put here, we do.
*/

import {socket, authority} from './client'
var utils = require('../utils')

export var lastUpdate = 0 //the last time a render update happened. if you switch tabs rendering stops (its beyond our control) but we can know how long they have been inactive by using this and then switch authority or do whatever //. lastUpdate could more accurately be called lastRender but i dont feel like changing it now
var inactivityTimeToDisconnect = 3 * 60 * 1000 //* lowering this can help reduce bandwidth but for our testing we dont want kicked so quickly

export var sleeping = false //this is whether the tab is sleeping or not. if they are not currently on the tab the browser stops rendering. we need to know this to do certain things like if this is the authority who is sleeping we need to find a new authority immediately.

export function SetLastRenderUpdate(t){
    lastUpdate = t
}

//here we check if this client is the authority and has been inactive too long (in another tab). because if in another tab, the game mostly pauses itself, sprites can no longer move etc, so we need to find another authority who is not inactive
//* but we also potentially do more here like disconnect the client who is inactive more than 1 minute
//. setInterval still runs if the user switches tabs thats why we do it this way. the render loop however stops when they switch tabs
setInterval(function(){
    if(lastUpdate != 0){ //lastUpdate has not been assigned yet so dont do anything or itll think everything is timing out because its at 0
        let timeSinceLastRender = Date.now() - lastUpdate //lastUpdate is the last time the render loop occurred. if the render loop has stopped, we know the client has switched tabs or something but either way gotta do some things
        
        //in this if/else block we test if the user is asleep or awake and inform the relay server accordingly, so it can do things such as check if the authority became asleep and find a new authority
        //if(timeSinceLastRender > 200){
        if(document.hidden){
            if(!sleeping){ //check this first so we dont spam this emit message to the server but rather only send it once upon the sleep starting
                socket.emit(utils.msg().sleep)
            }
            sleeping = true
        }
        else{
            if(sleeping){
                socket.emit(utils.msg().wake)
            }
            sleeping = false
        }

        //reload the page (taking the user out of the game) if they have been off the tab (asleep) for too long
        if(timeSinceLastRender > inactivityTimeToDisconnect){
            location.reload()
        }
    }
}, 1000/60)