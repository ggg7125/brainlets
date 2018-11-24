import { game } from "./index";
import { player } from "./sceneTest";
import { RequestPower, RequestDurability, RequestSpeed, RequestStamina, RequestVitality, RequestSpirit } from "./levels";
import { remotePlayers } from "./client";
import { StartRadar, RefreshRadar, RescaleRadarDots } from "./radar";
var utils = require('../utils')

export var nameFieldValue = null

var helpPopupCount = 0

export function HelpPopup(txt, timeout){
    if(!timeout) timeout = 3000
    helpPopupCount++
    let nowCount = helpPopupCount
    document.getElementById('helpPopup').textContent = txt
    document.getElementById('helpPopup').hidden = false
    setTimeout(function(){
        if(helpPopupCount === nowCount){
            document.getElementById('helpPopup').hidden = true
        }
    }, timeout)
}

export function RefreshMoneyUI(){
    if(player) document.getElementById('moneyValue').textContent = `${player.money}`
    let b = document.getElementById('moneyIcon')
    if(!b) return
    b.width = screen.width / 33
    b.height = screen.width / 33
    //b.style.left = `75px`
}

var xpBarMaxWidth = 30 //css vw

export function RefreshXPBar(){
    if(!player) return
    let xpWidth = player.xp / player.xpNeeded * xpBarMaxWidth
    document.getElementById('xpBackground').style.width = `${xpBarMaxWidth}vw`
    document.getElementById('xpBar').style.width = `${xpWidth}vw`
    document.getElementById('xpBarText').textContent = `Level ${player.level}`
}

export function RefreshStats(){
    if(!player || player['powerStat'] == undefined) return
    document.getElementById('statPoints').textContent = `Points: ${player['statPoints']}`
    document.getElementById('powerStat').textContent = `${player['powerStat']}`
    document.getElementById('durabilityStat').textContent = `${player['durabilityStat']}`
    document.getElementById('speedStat').textContent = `${player['speedStat']}`
    document.getElementById('staminaStat').textContent = `${player['staminaStat']}`
    document.getElementById('vitalityStat').textContent = `${player['vitalityStat']}`
    document.getElementById('spiritStat').textContent = `${player['spiritStat']}`
}

//this event occurs right after all html elements have loaded, but before any css is applied or any external images have been fully loaded (that would be the load/onload event)
document.addEventListener('DOMContentLoaded', function(){
    let days = (Date.now() - (new Date(2018, 10, 16).getTime())) / 1000 / 60 / 60 / 24 //. HEY! the months are from 0-11 not 1-12, 0 = January, 11 = December
    document.getElementById('launchTime').textContent = `Game Launched ${Math.round(days)} Days Ago`

    //* stat plus buttons
    document.getElementById('powerButton').addEventListener('click', RequestPower)
    document.getElementById('durabilityButton').addEventListener('click', RequestDurability)
    document.getElementById('speedButton').addEventListener('click', RequestSpeed)
    document.getElementById('staminaButton').addEventListener('click', RequestStamina)
    document.getElementById('vitalityButton').addEventListener('click', RequestVitality)
    document.getElementById('spiritButton').addEventListener('click', RequestSpirit)
    setInterval(RefreshStats, 500)

    //sets the initial size of the fullscreen button once when the page is loaded
    setTimeout(RefreshFullScreenButton, 0)
    RefreshStatsToggle()
    RefreshMoneyUI()

    setInterval(function(){
        if(player){
            document.getElementById('healthBar').style.width = `${player.health / 100 * 25}vw`
        }
    }, 200)

    setInterval(function(){
        if(player){
            document.getElementById('staminaBar').style.width = `${player.stamina / 100 * 25}vw`
        }
    }, 200)

    setInterval(function(){
        document.getElementById('playerCount').textContent = `${remotePlayers.length + 1} Players`
    }, 400)

    setInterval(RefreshXPBar, 300)

    //set focus to the nameField when the game starts for the player's convenience, they can just type the name and press Enter
    setTimeout(function(){
        document.getElementById('nameField').focus()
    }, 2000) //for some reason it wont take the focus unless we delay it. maybe something else is taking the focus away

    //* listen for name field text element value to change
    //document.getElementById("nameField").pattern = "[1-3]" //* example
    document.getElementById('nameField').addEventListener('keyup', function(){
        let val = document.getElementById('nameField').value
        if(!val || val == '') return
        nameFieldValue = val
    })

    //* listen for enter to press pressed in the nameField and treat it the same as pressing the Play button
    document.querySelector('#nameField').addEventListener("keyup", function(event){
        if(event.key !== "Enter") return
        document.querySelector("#playButton").click()
        event.preventDefault()
    })

    //* listen for the play button to be clicked
    document.getElementById('playButton').addEventListener('click', function(){
        CheckPlayerName()
        StartRadar()
        document.getElementById('titleUI').hidden = true
        document.getElementById('discordButton').hidden = true
        document.getElementById('combatUI').hidden = false
        document.getElementById('levelUI').hidden = false
        document.getElementById('statsButton').hidden = false
        document.getElementById('playerCount').hidden = false
        document.getElementById('moneyIcon').hidden = false
        document.getElementById('moneyValue').hidden = false
        game.scene.stop('LoginScene') //we tested it. if we dont stop the previous scene, they will both be active, but the newly loaded scene is just drawn on top of it.
        game.scene.start('TestScene') //* currently this is all that is needed to put us into the game scene but i think we need to create a wrapper function for easy comprehension and expansion later
    })

    document.getElementById('statsButton').addEventListener('click', function(){
        document.getElementById('levelUI').hidden = !document.getElementById('levelUI').hidden
    })
    
    document.getElementById('fullscreenButton').addEventListener('click', function(){
        if(!IsFullScreen()) GoFullScreen()
        else ExitFullScreen()
    })
})

//called on resize
export function RefreshFullScreenButton(){
    let b = document.getElementById('fullscreenButton')
    if(!b) return
    b.style.width = `${screen.width / 32}px`
    b.style.height = `${screen.width / 32}px`
}

//called on resize
export function RefreshStatsToggle(){
    let b = document.getElementById('statsButton')
    if(!b) return
    b.width = screen.width / 40 * 2
    b.height = screen.width / 40
    b.style.left = `75px`
}

export function IsFullScreen(){
    let fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement
    if(fullscreenElement) return true
    return false
}

export function ExitFullScreen(){
    let exitFullScreen = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen
    if(exitFullScreen) exitFullScreen.call(document)
}

//* check out our code for window.addEventListener('resize', function(event){ in sceneTest.js. since going fullscreen is a resize event, resize code is therefore relevent as it will execute too in case there is ever any confusing behavior
export function GoFullScreen(){
    //let html = document.documentElement //* i think using document.documentElement will cause problems on portals, so instead we are going to capture the base element where our specific html code begins
    let html = document.getElementById('myPhaserGameRoot')
    let fs = html.requestFullscreen || html.msRequestFullscreen || html.mozRequestFullScreen || html.webkitRequestFullscreen
    fs.call(html)
    //. VERY IMPORTANT TO KEEP THIS CODE. Because this is for making the CANVAS fullscreen which is something we may have to still do on game portals because on game portals the canvas is not full screen already like on our main site, so we have to ask the WINDOW to go fullscreen but ALSO THE CANVAS on game portals. THIS CODE WORKS TO DO THAT SO KEEP IT.
    //let canvas = document.getElementsByTagName('canvas')[0] //keep in mind every overhead chat text is its own canvas
    //fs.call(canvas)

    /*
    //. this code could probably be useful because clientWidth/Height is a different thing
    let canvas = document.getElementsByTagName('canvas')[0]
    //get the dimensions the browser is currently displaying the canvas in
    let displayWidth = canvas.clientWidth
    let displayHeight = canvas.clientHeight
    //check if the canvas is not the same size it is being displayed as
    if(canvas.width != displayWidth || canvas.height != displayHeight){
        //make the canvas width/height match the width/height it is in the browser
        canvas.width = displayWidth
        canvas.height = displayHeight
    }
    */
}

//this resizes the camera to take into account window size, basically with a smaller window the camera shrinks so players using smaller windows can still see the same distance as everyone else. if we dont, then if you resize your chrome window to 1/4th size you will see your character sprite stays the same size and you cant see very far from it at all. so we zoom out to compensate
export function RefreshCameraZoom(){
    let scene1 = game.scene.scenes[1]
    if(!scene1 || !scene1.scene || scene1.scene.settings.active == false) return //preventing weird null reference errors
    let zoom = Math.pow(0.55, 0.5)
    //now we compensate for window size - basically we 'shrink the game' with smaller windows so relative view distance remains constant
    let windowSizeMod = ((window.innerWidth / 1920) + (window.innerHeight / 1080)) * 0.5
    zoom *= windowSizeMod
    //* we decided we only want to do the zoom for the main scene NOT the title scene because it messes up our title background so that its way too small
    //for(let i in game.scene.scenes) game.scene.scenes[i].cameras.main.setZoom(zoom)
    if(player) zoom *= player.ViewDistMod()
    game.scene.scenes[1].cameras.main.setZoom(zoom)
    RefreshRadar()
    RescaleRadarDots()
}

//* this also sets sprite.spriteName
export function AddFloatingNameTo(sprite, spriteName){
    sprite.spriteName = spriteName
    
    let nameText = game.scene.scenes[1].make.text({
        x: sprite.x,
        y: sprite.y,
        style: {font: '50px myFont', fill: '#ffffff'},
    })
    nameText.setOrigin(0.5, 0.5)
    nameText.setText(spriteName)
    nameText.setDepth(utils.layers().entity4)
    //nameText.setAlign('center')
    //nameText.setColor('#ffffff')
    //nameText.setFont('35px monospace')
    sprite.floatingName = nameText
}

function CheckPlayerName(){
    if(!nameFieldValue || nameFieldValue == ''){
        nameFieldValue = `Player ${Math.round(Math.random() * 999)}` //* they didnt enter a name. give them a random name
    }
}

export function ShowOverheadMessage(sprite, msg){
    if(!sprite.overheadText){
        sprite.overheadText = game.scene.scenes[1].make.text({
            x: sprite.x,
            y: sprite.y,
            style: {
                font: '60px myFont',
                fill: '#ffffff', //check the css file for what myFont is
                backgroundColor: '#000000',
            },
        })
    }
    let text = sprite.overheadText
    text.setVisible(true)
    text.setOrigin(0.5, 0.5)
    text.setText(msg)
    text.runWordWrap(msg) //does not seem to do anything
    text.setDepth(utils.layers().ui)
    text.lastChatUpdate = Date.now()
    let timestamp = text.lastChatUpdate
    setTimeout(function(){
        if(text.lastChatUpdate == timestamp){
            text.setText('')
            text.setVisible(false)
        }
    }, 5000)
}