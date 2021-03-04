//socket 연결
const clientIo = io.connect("https://dev.knowledgetalk.co.kr:7100/SignalServer",{});

const roomIdInput = document.getElementById("roomIdInput");
const videoBox = document.getElementById("videoBox");
const printBox = document.getElementById("printBox")

const CreateRoomBtn = document.getElementById("CreateRoomBtn");
const RoomJoinBtn = document.getElementById("RoomJoinBtn");
const SDPBtn = document.getElementById("SDPBtn");

const CPCODE = "KP-CCC-demouser-01"
const AUTHKEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoidGVzdHNlcnZpY2UiLCJtYXhVc2VyIjoiMTAwIiwic3RhcnREYXRlIjoiMjAyMC0wOC0yMCIsImVuZERhdGUiOiIyMDIwLTEyLTMwIiwiYXV0aENvZGUiOiJLUC1DQ0MtdGVzdHNlcnZpY2UtMDEiLCJjb21wYW55Q29kZSI6IkxJQy0wMyIsImlhdCI6MTU5Nzk3NjQ3Mn0.xh_JgK67rNPufN2WoBa_37LzenuX_P7IEvvx5IbFZI4"

let members;
let roomId;
let userId;
let host;

let peers = {};
let streams = {};

/********************** 기타 method **********************/

//print log on page
const socketLog = (type, contents) => {
    let jsonContents = JSON.stringify(contents);
    const textLine = document.createElement("p");
    const textContents = document.createTextNode(`[${type}] ${jsonContents}`);
    textLine.appendChild(textContents);
    printBox.appendChild(textLine);
}

//send message to signaling server
//sunny) 서버로 보내기 위한 senddata
const sendData = data => {
    data.cpCode = CPCODE
    data.authKey = AUTHKEY
    socketLog('send', data);
    clientIo.emit("knowledgetalk", data);
}

const deletePeers = async () => {
    for(let key in streams) {
        if (streams[key] && streams[key].getTracks()) {
            streams[key].getTracks().forEach(track => {
                track.stop();
            })

            document.getElementById(key).srcObject = null;
            document.getElementById(key).remove();
        }
    }

    for(let key in peers) {
        if (peers[key]) {
            peers[key].close();
            peers[key] = null;
        }
    }
}

//영상 출력 화면 Box 생성
//sunny) 참가자 인원만큼 videoview박스 생성
const createVideoBox = id => {
    console.log("createVideoBox: "+id);
    let videoContainner = document.createElement("div");
    videoContainner.classList = "multi-video";
    videoContainner.id = id;

    let videoLabel = document.createElement("p");
    let videoLabelText = document.createTextNode(id);
    videoLabel.appendChild(videoLabelText);

    videoContainner.appendChild(videoLabel);
    //sunny) 해당 박스 엘리멘트 아이디는 multiVideo-userId로 한다.
    let multiVideo = document.createElement("video");
    multiVideo.autoplay = true;
    multiVideo.id = "multiVideo-" + id;
    videoContainner.appendChild(multiVideo);

    videoBox.appendChild(videoContainner);
}
/*
TODO:
 */
//Local stream, peer 생성 및 sdp return
const createSDPOffer = async id => {
    console.log("createSDPOffer: "+id);
    return new Promise(async (resolve, reject) => {
        peers[id] = new RTCPeerConnection();
        streams[id] = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
        let str = 'multiVideo-'+id;
        let multiVideo = document.getElementById(str);
        multiVideo.srcObject = streams[id];
        streams[id].getTracks().forEach(track => {
            peers[id].addTrack(track, streams[id]);
        });

        peers[id].createOffer().then(sdp => {
            peers[id].setLocalDescription(sdp);
            return sdp;
        }).then(sdp => {
            resolve(sdp);
        })
    })
}

//send sdp answer
/*TODO: */
const createSDPAnswer = async data => {
    console.log("createSDPAnswer: "+data.displayId);
    let displayId;
    //sunny) 1대1 통화
    if(members.length<=2){
        console.log("멤버3미만:"+members.length);
        displayId = data.userId;
    //sunny) N대N 통화
    }else if(members.length>2){
        console.log("멤버3이상:"+members.length);
        displayId = data.displayId;
    }
    peers[displayId] = new RTCPeerConnection();
    peers[displayId].ontrack = e => {
        streams[displayId] = e.streams[0];

        let multiVideo = document.getElementById(`multiVideo-${displayId}`);
        multiVideo.srcObject = streams[displayId];
    }

    await peers[displayId].setRemoteDescription(data.sdp);
    let answerSdp = await peers[displayId].createAnswer();
    await peers[displayId].setLocalDescription(answerSdp);
    peers[displayId].onicecandidate = e => {
        if(!e.candidate){
            let reqData = {
                "eventOp": "SDP",
                "sdp": peers[displayId].localDescription,
                "roomId": data.roomId,
                "usage": "cam",
                "pluginId": data.pluginId,
                "userId": userId
            };

            sendData(reqData);
        }
    }
}

//퇴장 시, stream,peer 제거
const leaveParticipant = id => {
    document.getElementById(`multiVideo-${id}`).remove();
    document.getElementById(id).remove();

    if(streams[id]){
        streams[id].getVideoTracks()[0].stop();
        streams[id].getAudioTracks()[0].stop();
        streams[id] = null;
        delete streams[id];
    }

    if(peers[id]){
        peers[id].close();
        peers[id] = null;
        delete peers[id];
    }

}

/********************** button event **********************/
CreateRoomBtn.addEventListener('click', () => {
    host = true;
    let data = {
        "eventOp":"CreateRoom"
    }

    sendData(data);
});
RoomJoinBtn.addEventListener('click', () => {
    let data = {
        "eventOp":"RoomJoin",
        "roomId": roomIdInput.value
    }

    sendData(data);
});
SDPBtn.addEventListener('click', async () => {

    let sdp = await createSDPOffer(userId);

    let data = {
        "eventOp":"SDP",
        "pluginId": undefined,
        "roomId": roomIdInput.value,
        "sdp": sdp,
        "usage": "cam",
        "userId": userId,
        "host": host
    }

    sendData(data);
})



/********************** event receive **********************/
clientIo.on("knowledgetalk", async data => {

    socketLog('receive', data);

    switch(data.eventOp || data.signalOp) {
        case 'CreateRoom':
            if(data.code == '200'){
                createRoom(data);
                CreateRoomBtn.disabled = true;
            }
            break;

        case 'RoomJoin':
            if(data.code == '200'){
                roomJoin(data);
                //sunny) SDP button disable이 방장 포함 참여자가 2명이어도 able하게 킨다.
                RoomJoinBtn.disabled = true;
                CreateRoomBtn.disabled = true;
                SDPBtn.disabled = false;
                
            }
            break;

        case 'StartSession':
            console.log("startsession 시행됨");
            startSession(data);
            break;

        case 'SDP':
            console.log("case sdp");
            if(data.useMediaSvr == 'Y'){
                console.log("offer Y")
                if(data.sdp && data.sdp.type == 'offer'){
                    createSDPAnswer(data);
                }
                else if(data.sdp && data.sdp.type == 'answer'){
                    peers[userId].setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
            }else if(data.useMediaSvr == 'N'){
                //sunny) 참여자 3명 미만일 때도 offer와 answer가 되게 설정
                console.log("offer N")
                if(data.sdp && data.sdp.type == 'offer'){
                    createSDPAnswer(data);
                }
                else if(data.sdp && data.sdp.type == 'answer'){
                    peers[userId].setRemoteDescription(new RTCSessionDescription(data.sdp));
                }
            }
            break;
        case 'ReceiveFeed':
            receiveFeed(data)
            break;

        case 'Presence':
            if(data.action == 'exit'){
                leaveParticipant(data.userId)
            }
            break;

    }

});


const createRoom = data => {
    roomIdInput.value = data.roomId;

    //room id copy to clipboard
    roomIdInput.select();
    roomIdInput.setSelectionRange(0, 99999);
    document.execCommand("copy");

    alert('room id copied')
}

const roomJoin = data => {
    userId = data.userId;
    members = Object.keys(data.members);
    console.log("룸조인데이터: "+ members)
    console.log("룸조인데이터2: "+ members.length)
    //sunny) room join할 때 멤버가 2명이상이면 createvideobox 활성화
    if(members.length>1){
        for(let i=0; i<members.length; ++i){
            let user = document.getElementById(members[i]);
            if(!user){
                createVideoBox(members[i]);
            }
        }
    }
}

const startSession = async data => {
    members = Object.keys(data.members);
    console.log("멤버스: "+members)
    console.log("멤버스데이터: "+ data)
    //sunny) 3명 이상일 때, 다자간 통화 연결 시작
    if(data.useMediaSvr == 'Y'){
        console.log("멤버스 YES: "+members)
        for(let i=0; i<members.length; ++i){
            let user = document.getElementById(members[i]);
            if(!user){
                createVideoBox(members[i]);
            }
        }

        SDPBtn.disabled = false;
        host = data.host;
    //sunny) 의미는 크게 없음
    }else if(data.useMediaSvr == 'N'){
        console.log("멤버스 NO: "+members)
        for(let i=0; i<members.length; ++i){
            let user = document.getElementById(members[i]);
            if(!user){
                createVideoBox(members[i]);
            }
        }

        SDPBtn.disabled = false;
        host = data.host;
    }
}

const receiveFeed = (data) => {
    data.feeds.forEach(result => {
        let data = {
            "eventOp":"SendFeed",
            "roomId": roomIdInput.value,
            "usage": "cam",
            "feedId": result.id,
            "display": result.display
        }

        sendData(data);
    })
}
