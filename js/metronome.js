
let audioContext;

let preset = 0              // index in program
let presetBar = 0           // current bar in the preset
let maxPresetBars           // total bars in the preset

let unlocked = false;       
let isPlaying = false;      // Are we currently playing?
let startTime;              // The start time of the entire sequence.
let currentSubdivision;     // the current part of the 12let

let beat = 0                // incremented in nextNote()
let beatsPerMeasure = 4
let tempo = 120.0;          // tempo (in beats per minute)
let lookahead = 25;         // How frequently to call scheduling function (in milliseconds)

// hard coded, to be saved in LS
const program = [
    {
        tempo: 160,
        sixtGain: 0, 
        eighGain: 0,
        tripGain: 1,
        quarGain: 1,
        measGain: 1,
        mastGain: 1,
        maxPresetBars: 3,
        beatsPerMeasure: 5,
        measSound: 'sounds/boom.wav',
        quarSound: 'sounds/kick.wav',
        eighSound: 'sounds/tink.wav',
        tripSound: 'sounds/hihat.wav',
        sixtSound: 'sounds/ride.wav'
    },
    {
        tempo: 100,
        sixtGain: 1, 
        eighGain: 1,
        tripGain: 0,
        quarGain: 1,
        measGain: 1,
        mastGain: 1,
        maxPresetBars: 2,
        beatsPerMeasure: 3,
        measSound: 'sounds/kick.wav',
        quarSound: 'sounds/snare.wav',
        eighSound: 'sounds/hihat.wav',
        tripSound: 'sounds/tink.wav',
        sixtSound: 'sounds/openhat.wav'
    },
    {
        tempo: 80,
        sixtGain: 0, 
        eighGain: 0,
        tripGain: 0,
        quarGain: 1,
        measGain: 1,
        mastGain: 1,
        maxPresetBars: 3,
        beatsPerMeasure: 2,
        measSound: 'sounds/ride.wav',
        quarSound: 'sounds/tink.wav',
        eighSound: 'sounds/kick.wav',
        tripSound: 'sounds/ride.wav',
        sixtSound: 'sounds/hihat.wav'
    },
]

let lastPreset = program.length         // index of last preset
let programMode = false     // toggled on toggleProgramMode()

let scheduleAheadTime = 0.1;// How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)

let noteTime                // the time for the next 12let note, assigned to current time at play() then
                            // scheduled to a new time via a formula involving tempo and fractional subdivision of the beat.
                            // passed into scheduleNote() 
  
// subdivision and master volume control
let gainValues = {          
    sixtGain: 0,
    eighGain: 0,
    quarGain: 1,
    tripGain: 0,
    measGain: 1,
    mastGain: 0
}

let soundUrls = {
    // defaults
    meas: 'sounds/clap.wav',
    quar: 'sounds/kick.wav',
    eigh: 'sounds/ride.wav',
    trip: 'sounds/snare.wav',
    sixt: 'sounds/tink.wav'
}   
let noteLength = 0.05;      // length of "beep" (in seconds)

// let canvas,                 // the canvas element
//     canvasContext;          // canvasContext is the canvas' context 2D
// let last16thNoteDrawn = -1; // the last "box" we drew on the screen
// let notesInQueue = [];      // the notes that have been put into the web audio,
//                             // and may or may not have played yet. {note, time}
let timerWorker = null;     // The Web Worker used to fire timer messages

// tap metronome 
let lastClick
let secondToLastClick

// sounds
let measBuffer // measure
let quarBuffer // quarter
let eighBuffer // eighth
let tripBuffer // triplet
let sixtBuffer // sixteenth

function toggleProgramMode() {
    programMode = !programMode
    if (programMode) {
        document.getElementById('program-toggle').innerText = "Program mode on."
    }
    else {
        document.getElementById('program-toggle').innerText = "Program mode off."

    }
}

// implement next
// function savePresets() {
//     const preset = {
//         tempo: tempo,
//         sixtGain: gainValues.sixtGain, 
//         eighGain: gainValues.eighGain,
//         tripGain: gainValues.tripGain,
//         quarGain: gainValues.quarGain,
//         measGain: gainValues.measGain,
//         mastGain: gainValues.mastGain,
//         maxLoopBars: maxLoopBars
//     }
//     program.push(preset)
// }

async function loadSound(url) {
    let response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer
}
async function setupSounds(urls) {
    measBuffer = await loadSound(urls.meas)
    quarBuffer = await loadSound(urls.quar)
    eighBuffer = await loadSound(urls.eigh)
    tripBuffer = await loadSound(urls.trip)
    sixtBuffer = await loadSound(urls.sixt)
}
function playSound(buffer, time) {
    const soundSource = audioContext.createBufferSource()
    soundSource.buffer = buffer
    soundSource.connect(gainNode)
    soundSource.start(time)
    return soundSource
}

function playAccent(buffer, time) {
    const accentSource = audioContext.createBufferSource()
    accentSource.buffer = buffer
    accentSource.connect(gainNode)
    accentSource.start(time)
    return accentSource
}

function nextLoop(next) {
    presetBar = 0
    tempo = next.tempo
    gainValues.sixtGain = next.sixtGain 
    gainValues.eighGain = next.eighGain
    gainValues.tripGain = next.tripGain
    gainValues.quarGain = next.quarGain
    gainValues.measGain = next.measGain
    gainValues.mastGain = next.mastGain
    soundUrls.meas = next.measSound
    soundUrls.quar = next.quarSound
    soundUrls.eigh = next.eighSound
    soundUrls.trip = next.tripSound
    soundUrls.sixt = next.sixtSound
    maxPresetBars = next.maxPresetBars
}

function stopProgram() {
    timerWorker.postMessage("stop");
    isPlaying = !isPlaying;
    document.getElementById('beat').innerText = 1
    document.getElementById('play').innerText = 'Play'
}

function handleTap() {
    const timeNow = new Date().getTime()
    if (secondToLastClick) {
        const difference = (timeNow - secondToLastClick) / 2
        tempo = Math.floor(60000 / difference) 
    } 
    secondToLastClick = lastClick
    lastClick = timeNow
    if (tempo > 250) return 250
    if (tempo < 30) return 30
    return tempo
}

function volume(value) {
    return (gainValues.mastGain + 1) * value
}

// First, let's shim the requestAnimationFrame API, with a setTimeout fallback
// window.requestAnimFrame = (function(){
//     return  window.requestAnimationFrame ||
//     window.webkitRequestAnimationFrame ||
//     window.mozRequestAnimationFrame ||
//     window.oRequestAnimationFrame ||
//     window.msRequestAnimationFrame ||
//     function( callback ){
//         window.setTimeout(callback, 1000 / 60);
//     };
// })();

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT tempo value to calculate beat length.
                                            // secondsPerBeat converts tempo into seconds
    noteTime += (1/12) * secondsPerBeat;    // beats subdivided into 12 parts to cover 16th, triplets, 8ths   
                                            // define time at which next note should play
    currentSubdivision++
    if (currentSubdivision >= beatsPerMeasure * 12 || currentSubdivision === 0) {
        console.log('measure')
        currentSubdivision = 0
        beat = 0                                    // reset at measure line for display
        if (programMode) {
            presetBar++
            if (presetBar === maxPresetBars && program[preset]) {    
                nextLoop(program[preset])
                setupSounds(soundUrls)
                presetBar = 0                       // reset presetBar for next loop
                preset++
            }
            if (presetBar === maxPresetBars && preset === lastPreset) {
                stopProgram()
                presetBar = 0
                preset = 0
            }
        }
    }
    if (currentSubdivision % 12 === 0) {
        beat++  
    }                                        
    document.getElementById('beat').innerText = 'Beat ' + beat
    document.getElementById('preset-bars').innerText = maxPresetBars
    document.getElementById('preset-bar').innerText = 'Preset Bar ' + (presetBar + 1)
    document.getElementById('preset-number').innerText = 'Preset Number ' + (preset)
}

function scheduleNote( time ) {
    accentGainNode = audioContext.createGain()
    accentGainNode.connect(audioContext.destination)
    gainNode = audioContext.createGain()
    gainNode.connect(audioContext.destination)          
    
    if (currentSubdivision % (beatsPerMeasure * 12) === 0) {
        if (gainValues.measGain > 0) {
            playAccent(measBuffer, time)
            accentGainNode.gain.value = volume(gainValues.measGain)    
        } 
    }
    if (currentSubdivision % 12 === 0) {
        playSound(quarBuffer, time)
        gainNode.gain.value = volume(gainValues.quarGain)
    } 
    else if (currentSubdivision % 6 === 0) {
        playSound(eighBuffer, time)
        gainNode.gain.value = volume(gainValues.eighGain)
    }
    else if (currentSubdivision % 4 === 0) {
        playSound(tripBuffer, time)
        gainNode.gain.value = volume(gainValues.tripGain)
    }
    else if (currentSubdivision % 3 === 0) {
        playSound(sixtBuffer, time)
        gainNode.gain.value = volume(gainValues.sixtGain)
    } else {
        gainNode.gain.value = 0                             // mute all other 12let notes
    }
                                                            // use 8 for HNT and 2 for TS
}

function scheduler() {
    if (noteTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote(noteTime);
        nextNote();
    }
}

function play() {
    lastClick = null
    beat = 1
    if (!unlocked) {
      // play silent buffer to unlock the audio
      let buffer = audioContext.createBuffer(1, 1, 22050);
      let node = audioContext.createBufferSource();
      node.buffer = buffer;
      node.start(0);
      unlocked = true;
    }

    isPlaying = !isPlaying;

    if (isPlaying) { 
        if (programMode) {
            nextLoop(program[preset])
            setupSounds(soundUrls)
            preset++
        }
        currentSubdivision = 0
        noteTime = audioContext.currentTime + .05,
        timerWorker.postMessage("start");
        return "Stop";
    } else {
        preset = 0
        document.getElementById('beat').innerText = 1
        timerWorker.postMessage("stop");
        return "Play";
    }
}

// function resetCanvas (e) {
//     // resize the canvas - but remember - this clears the canvas too.
//     canvas.width = window.innerWidth;
//     canvas.height = window.innerHeight;

//     //make sure we scroll to the top left.
//     window.scrollTo(0,0); 
// }

// function draw() {
//     let currentNote = last16thNoteDrawn;
//     let currentTime = audioContext.currentTime;

//     while (notesInQueue.length && notesInQueue[0].time < currentTime) {
//         currentNote = notesInQueue[0].note;
//         notesInQueue.splice(0,1);   // remove note from queue
//     }

//     // We only need to draw if the note has moved.
//     if (last16thNoteDrawn != currentNote) {
//         let x = Math.floor( canvas.width / 18 );
//         canvasContext.clearRect(0,0,canvas.width, canvas.height); 
//         for (let i=0; i<16; i++) {
//             canvasContext.fillStyle = ( currentNote == i ) ? 
//                 ((currentNote%4 === 0)?"red":"blue") : "black";
//             canvasContext.fillRect( x * (i+1), x, x/2, x/2 );
//         }
//         last16thNoteDrawn = currentNote;
//     }

//     // set up to draw again
//     requestAnimFrame(draw);
// }

function init(){
    // let container = document.createElement( 'div' );

    // container.className = "container";
    // canvas = document.createElement( 'canvas' );
    // canvasContext = canvas.getContext( '2d' );
    // canvas.width = window.innerWidth; 
    // canvas.height = window.innerHeight; 
    // document.body.appendChild( container );
    // container.appendChild(canvas);    
    // canvasContext.strokeStyle = "#ffffff";
    // canvasContext.lineWidth = 2;

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.


    // if we wanted to load audio files, etc., this is where we should do it.

    // window.onorientationchange = resetCanvas;
    // window.onresize = resetCanvas;

    // requestAnimFrame(draw);    // start the drawing loop.
    // Tone.Transport.start(0)
    // console.log(Tone.Transport)
    audioContext = new AudioContext()
    
    
    setupSounds(soundUrls)      //setup default sounds

    timerWorker = new Worker("js/metronomeworker.js");
    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );
