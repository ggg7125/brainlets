import { game } from "./index";
import { RadarDot } from "./classes";
import { InWorldBounds } from "./clientUtilsES6";
var utils = require('../utils')

var dots = [] //dots that the radar will update
var dotSizeMod = 0.6 //arbitrary, whatever looks best
var radarStarted = false
var worldWidth = 0 //these will set themselves to the world's map size below
var worldHeight = 0
var scene //shorthand access to the main scene
var cam //shorthand access to main camera
var rightEdgePadding = 70 //these are how far we want to push these edges away from touching the edge of the screen, we dont want it to be all the way at the ends of the screen
var bottomEdgePadding = 100
var boxSize = 200 //the dimensions of what we consider the radar 'box'. dots can only exist within this area.

//lets a sprite add itself to the player's radar
export function AddToRadar(s, dotKey, dotSize){
    if(dotKey === undefined) dotKey = 'blueRadarDot'
    if(dotSize === undefined) dotSize = 1
    let config = {
        key: dotKey,
        scene: game.scene.scenes[1],
    }
    let dot = new RadarDot(config)
    dot.setScrollFactor(0)
    dot.radarSprite = s
    dot.dotSize = dotSize
    RescaleRadarDot(dot)
    dots.push(dot)
    RefreshRadar()
}

export function RemoveFromRadar(s){
    let dot
    for(let i in dots){
        let d = dots[i]
        if(d.radarSprite === s){
            dot = d
            break
        }
    }
    dots = utils.remove(dots, dot)
    dot.destroy()
}

export function StartRadar(){
    scene = game.scene.scenes[1]
    cam = scene.cameras.main
    worldWidth = scene.worldBoundsX
    worldHeight = scene.worldBoundsY
    radarStarted = true
    setInterval(RefreshRadar, 100)
}

export function RefreshRadar(){
    if(!radarStarted) return
    for(let dot of dots){
        if(!dot.radarSprite){
            dots = utils.remove(dots, dot)
            dot.destroy()
            continue
        }
        if(!InWorldBounds(dot.radarSprite.x, dot.radarSprite.y)){
            if(dot.visible) dot.setVisible(false)
            continue
        }
        if(!dot.visible) dot.setVisible(true)
        let xFrac = dot.radarSprite.x / worldWidth //what fraction across the world this sprite is
        let yFrac = dot.radarSprite.y / worldHeight
        //with this, the dot is now in the exact center of the camera regardless of zoom
        let x = cam.width / 2
        let y = cam.height / 2
        //with this, the dot is now perfectly in the bottom right corner of the screen regardless of zoom
        x += cam.width / 2 / cam.zoom
        y += cam.height / 2 / cam.zoom
        //with this, the dot is on what we will now consider the 'left edge' of where the radar's box begins
        x -= boxSize / cam.zoom
        y -= boxSize / cam.zoom
        //with this, if xFrac and yFrac were 0.5 (the center of the world map), this will make the dot be in the exact center of the radar too
        x += (boxSize / cam.zoom) * xFrac
        y += (boxSize / cam.zoom) * yFrac
        //now, because the radar box is precisely in the bottom right corner and we dont quite want it that far down we move it away from that corner a bit
        x -= rightEdgePadding / cam.zoom
        y -= bottomEdgePadding / cam.zoom
        dot.setPosition(x, y)
    }
}

//the dots will shrink as the map zooms out if we do not use these functions to compensate
export function RescaleRadarDots(){
    for(let dot of dots){
        RescaleRadarDot(dot)
    }
}

export function RescaleRadarDot(dot){
    dot.setScale(dot.dotSize * dotSizeMod / cam.zoom)
}