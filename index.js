import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2'
import { dcutr } from '@libp2p/dcutr'
import { identify } from '@libp2p/identify'
import { webRTC } from '@libp2p/webrtc'
import { webSockets } from '@libp2p/websockets'
import * as filters from '@libp2p/websockets/filters'
import { multiaddr } from '@multiformats/multiaddr'
import { createLibp2p } from 'libp2p'
import { fromString, toString } from 'uint8arrays'

const DOM = {
  peerId: () => document.getElementById('peer-id'),

  dialMultiaddrInput: () => document.getElementById('dial-multiaddr-input'),
  dialMultiaddrButton: () => document.getElementById('dial-multiaddr-button'),

  subscribeTopicInput: () => document.getElementById('subscribe-topic-input'),
  subscribeTopicButton: () => document.getElementById('subscribe-topic-button'),

  sendTopicMessageInput: () => document.getElementById('send-topic-message-input'),
  sendTopicMessageButton: () => document.getElementById('send-topic-message-button'),
  sendTrainIsHereButton: () => document.getElementById('send-train-is-here-button'),
  changeStationNameButton: () => document.getElementById('change-station-name-button'),
  fetchStationMapButton: () => document.getElementById('fetch-station-map-button'),
  changeStationPositionButton: () => document.getElementById('change-station-position-button'),
  output: () => document.getElementById('output'),

  listeningAddressesList: () => document.getElementById('listening-addresses'),
  peerConnectionsList: () => document.getElementById('peer-connections'),
  topicPeerList: () => document.getElementById('topic-peers')
}

const appendOutput = (line) => {
  DOM.output().innerText += `${line}\n`
}
const clean = (line) => line.replaceAll('\n', '')

const libp2p = await createLibp2p({
  addresses: {
    listen: [
      // create listeners for incoming WebRTC connection attempts on on all
      // available Circuit Relay connections
      '/webrtc'
    ]
  },
  transports: [
    // the WebSocket transport lets us dial a local relay
    webSockets({
      // this allows non-secure WebSocket connections for purposes of the demo
      filter: filters.all
    }),
    // support dialing/listening on WebRTC addresses
    webRTC(),
    // support dialing/listening on Circuit Relay addresses
    circuitRelayTransport({
      // make a reservation on any discovered relays - this will let other
      // peers use the relay to contact us
      discoverRelays: 1
    })
  ],
  // a connection encrypter is necessary to dial the relay
  connectionEncryption: [noise()],
  // a stream muxer is necessary to dial the relay
  streamMuxers: [yamux()],
  connectionGater: {
    denyDialMultiaddr: () => {
      // by default we refuse to dial local addresses from browsers since they
      // are usually sent by remote peers broadcasting undialable multiaddrs and
      // cause errors to appear in the console but in this example we are
      // explicitly connecting to a local node so allow all addresses
      return false
    }
  },
  services: {
    identify: identify(),
    pubsub: gossipsub(),
    dcutr: dcutr()
  },
  connectionManager: {
    minConnections: 0
  }
})

DOM.peerId().innerText = libp2p.peerId.toString()

function updatePeerList () {
  // Update connections list

  const currentPeers = libp2p.getPeers().map(peerId => peerId.toString());

    const peerList = currentPeers.map(peerId => {
      const el = document.createElement('li');
      el.textContent = peerId;
  
      const addrList = document.createElement('ul');
      for (const conn of libp2p.getConnections(peerId)) {
        const addr = document.createElement('li');
        addr.textContent = conn.remoteAddr.toString();
        addrList.appendChild(addr);
      }
  
      el.appendChild(addrList);
      return el;
    });

  DOM.peerConnectionsList().replaceChildren(...peerList)

  Object.keys(stationDict).forEach(peerId => {
    if (!currentPeers.includes(peerId)) {
      console.log(`Removing disconnected peer: ${peerId}`);
      delete stationDict[peerId];
    }
  });

  // Update the station list UI to reflect changes
  // updateStationListUI();
}

// update peer connections
libp2p.addEventListener('connection:open', () => {
  updatePeerList();
  libp2p.getPeers().forEach(peerId => updateStationDict(peerId));
});
libp2p.addEventListener('connection:close', () => {
  updatePeerList();
  libp2p.getPeers().forEach(peerId => updateStationDict(peerId, null, false));
});

// update listening addresses
libp2p.addEventListener('self:peer:update', () => {
  const multiaddrs = libp2p.getMultiaddrs()
    .map((ma) => {
      const el = document.createElement('li')
      el.textContent = ma.toString()
      return el
    })
  DOM.listeningAddressesList().replaceChildren(...multiaddrs)
})

// dial remote peer
DOM.dialMultiaddrButton().onclick = async () => {
  const ma = multiaddr(DOM.dialMultiaddrInput().value)
  appendOutput(`Dialing '${ma}'`)
  await libp2p.dial(ma)
  appendOutput(`Connected to '${ma}'`)
}

// subscribe to pubsub topic
DOM.subscribeTopicButton().onclick = async () => {
  const topic = DOM.subscribeTopicInput().value
  appendOutput(`Subscribing to '${clean(topic)}'`)

  libp2p.services.pubsub.subscribe(topic)

  DOM.sendTopicMessageInput().disabled = undefined
  DOM.sendTopicMessageButton().disabled = undefined
  DOM.sendTrainIsHereButton().disabled = undefined
  DOM.changeStationNameButton().disabled = undefined
  DOM.changeStationPositionButton().disabled = undefined
  DOM.fetchStationMapButton().disabled = undefined
}

// send message to topic
DOM.sendTopicMessageButton().onclick = async () => {
  const topic = DOM.subscribeTopicInput().value
  const message = DOM.sendTopicMessageInput().value
  appendOutput(`Sending message '${clean(message)}'`)

  await libp2p.services.pubsub.publish(topic, fromString(message))
}

// send message to topic with peer ID
DOM.sendTrainIsHereButton().onclick = async () => {
  const topic = DOM.subscribeTopicInput().value;
  const message = `train_location ${libp2p.peerId.toString()}`;
  appendOutput(`Sending message '${clean(message)}'`);

  await libp2p.services.pubsub.publish(topic, fromString(message));
  DOM.peerId().style.color = 'red';
  const peerElements = DOM.peerConnectionsList().children;
  for (let i = 0; i < peerElements.length; i++) {
    peerElements[i].style.color = 'black';
  }
  train_location = libp2p.peerId.toString();
  updateMapListUI();
}

// update topic peers
setInterval(() => {
  const topic = DOM.subscribeTopicInput().value

  const peerList = libp2p.services.pubsub.getSubscribers(topic)
    .map(peerId => {
      const el = document.createElement('li')
      el.textContent = peerId.toString()
      return el
    })
  DOM.topicPeerList().replaceChildren(...peerList)
}, 500)


libp2p.services.pubsub.addEventListener('message', event => {
  const topic = event.detail.topic;
  const message = toString(event.detail.data);
  const messageContent = message.split(' ');

  appendOutput(`Message received on topic '${topic}'`);
  appendOutput(message);

  // 🚇

  if (messageContent[0] === 'train_location') {
    const receivedPeerId = messageContent[1].trim();
    console.log(`Received Peer ID: ${receivedPeerId}`);
    DOM.peerId().style.color = 'black';
    train_location = receivedPeerId;
    updateMapListUI();
    const peerElements = DOM.peerConnectionsList().children;
    console.log(`Total peers listed: ${peerElements.length}`);

    for (let i = 0; i < peerElements.length; i++) {
      const currentPeerText = peerElements[i].textContent.trim();
      if (currentPeerText.includes(receivedPeerId)) {
        peerElements[i].style.color = 'red';
      } else {
        peerElements[i].style.color = 'black';
      }
    }
  }

  if (messageContent[0] === 'change_name') {
    const [command, peerId, ...nameParts] = message.split(' ');
      const newName = nameParts.join(' ');
      updateStationDict(peerId, newName);
      console.log(`Received new name for peer: ${peerId} - ${newName}`);
  }
  
  if (messageContent[0] === 'change_position') {
    const [command, peerId, peerBefore] = message.split(' ');
      updateMap(peerId, peerBefore);
      console.log(`Received new position for peer: ${peerId} - ${peerBefore}`);
  }

  if (messageContent[0] === 'fetch_map') {
    const [command, peerTo, peerId] = message.split(' ');
    if (libp2p.peerId.toString() === peerId) {
      const topic = DOM.subscribeTopicInput().value;
      const mapData = stationMap.join(' '); 
      const message = `send_map ${peerTo} ${mapData}`;
      libp2p.services.pubsub.publish(topic, fromString(message));
    }
  }

  if (messageContent[0] === 'send_map') {
    const [command, peerId, ...mapParts] = message.split(' ');
    stationMap.length = 0;
    stationMap.push(...mapParts);
    updateMapListUI(); 
  }
});

// Initialize the station dictionary
const stationDict = {};
let train_location = null;

// Function to update station dictionary and UI
function updateStationDict(peerId, name = null, active = false) {
  console.log(`Updating station dict for ${peerId} with name ${name} and active status ${active}`);
  if (!stationDict[peerId]) {
    stationDict[peerId] = { name: peerId, active: active };
  }
  if (name) {
    stationDict[peerId].name = name;
  }
  stationDict[peerId].active = active;
  // updateStationListUI();
}

// Function to update the station list UI
// function updateStationListUI() {
//   const stationListElement = document.getElementById('station-list');
//   const stationList = Object.keys(stationDict).map(peerId => {
//     const station = stationDict[peerId];
//     const el = document.createElement('li');
//     el.textContent = `${station.name} (Active: ${station.active})`;
//     return el;
//   });
//   stationListElement.replaceChildren(...stationList);
// }

// Function to handle name change
function changeStationName(peerId, newName) {
  updateStationDict(peerId, newName);
  const topic = DOM.subscribeTopicInput().value;
  const message = `change_name ${peerId} ${newName}`;
  libp2p.services.pubsub.publish(topic, fromString(message));
}

// Example usage: Change station name via UI
DOM.changeStationNameButton().onclick = () => {
  const newName = prompt("Enter new station name:");
  if (newName) {
    changeStationName(libp2p.peerId.toString(), newName);
    const stationNameElement = document.getElementById('this-station-name');
    stationNameElement.textContent = newName;
  }
};

// Initialize the station dictionary
const stationMap = [];

// Function to update station dictionary and UI
function updateMap(peerId, peerBefore) {
  console.log(`Updating station map for ${peerId} position to after ${peerBefore}`);
  if (stationMap.length === 0) {
    stationMap.push(peerBefore);
    stationMap.push(peerId);
  } else {
    const index = stationMap.indexOf(peerBefore);
    if (index !== -1) {
      // Insert peerId right after peerBefore
      stationMap.splice(index + 1, 0, peerId);
    } else {
      // If peerBefore is not found, you might want to handle this case, e.g., append at the end or log an error
      console.log(`PeerBefore ${peerBefore} not found in the station map.`);
    }
  }
  // updateStationListUI();
  updateMapListUI();
}

function updateMapListUI() {
  const stationListElement = document.getElementById('station-map-list');
  const announcementTextElement = document.getElementById('announcement-text');
  const el = document.createElement('li');
  el.style.textAlign = 'left'; 

  const stationList = stationMap.map(peerId => {
    const displayName = stationDict[peerId] && (stationDict[peerId].name !== peerId) 
                        ? stationDict[peerId].name 
                        : `...${peerId.slice(-4)}`;
    // Append the train emoji if this is the current train location
    if (peerId === train_location) {
      return `${displayName} 🚇`;
    }
    return displayName;
  }).join(' ----> ');

  // Update the announcement text based on the train's position
  const trainIndex = stationMap.indexOf(train_location);
  if (trainIndex === -1) {
    announcementTextElement.innerText = 'The train location is unknown.';
  } else {
    // Assuming the third item is the reference station
    const referenceStationIndex = stationMap.indexOf(libp2p.peerId.toString());
    const distance = Math.abs(trainIndex - referenceStationIndex);
    if (distance === 0) {
      announcementTextElement.innerText = 'The train is here!';
    } else if (trainIndex < referenceStationIndex) {
      announcementTextElement.innerText = `The train is ${distance} station(s) away, approaching.`;
    } else {
      announcementTextElement.innerText = `The train is ${distance} station(s) away, departing.`;
    }
  }

  el.textContent = stationList;
  stationListElement.replaceChildren(el);
}

// Function to handle position change
function changeStationPosition(peerId, stationBefore) {
  updateMap(peerId, stationBefore);
  const topic = DOM.subscribeTopicInput().value;
  const message = `change_position ${peerId} ${stationBefore}`;
  libp2p.services.pubsub.publish(topic, fromString(message));
}

DOM.changeStationPositionButton().onclick = () => {
  const newName = prompt("Enter the station name before you:");
  if (newName) {
    changeStationPosition(libp2p.peerId.toString(), newName);
  }
};

// Function to handle position change
function fetchStationMap(peerId, fetch_from) {
  const topic = DOM.subscribeTopicInput().value;
  const message = `fetch_map ${peerId} ${fetch_from}`;
  libp2p.services.pubsub.publish(topic, fromString(message));
}

DOM.fetchStationMapButton().onclick = () => {
  const newName = prompt("Enter the station id you want to fetch map data from:");
  if (newName) {
    fetchStationMap(libp2p.peerId.toString(), newName);
  }
};