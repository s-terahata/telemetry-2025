const statusDiv = document.getElementById('status');
const pollingStatusDiv = document.getElementById('pollingStatus');
const pollingStartButton = document.getElementById('pollingStartButton');
const pollingStopButton = document.getElementById('pollingStopButton');
const pollingCountInput = document.getElementById('pollingCount')
const pollingList = document.getElementById('pollingList')

const userAgentID = navigator.userAgent + "_" + new Date().getTime();
const encoder = new TextEncoder();

const brokerUrl = "wss://x41e9ae7.ala.asia-southeast1.emqxsl.com:8084/mqtt"
const topicRoot = "player/telemetry/"

// �|�[�����O�̊Ԋu[ms]
const pollingInterval = 1000

// �o�b�e���[���
const batteryStatusMap = {
    "0": "Unknown",
    "1": "Charging",
    "2": "Discharging",
    "3": "NotCharging",
    "4": "Full"
};

// �M���
const thermalStatusMap = {
    "-1": "Unknown",
    "0": "Nominal",
    "1": "Fair",
    "2": "Serious",
    "3": "Critical"
};

// �v���C���[��
let playerCount;
// �v���C���[���ꗗ
const players = {}

// MQTT�N���C�A���g�{��
const client = new Paho.MQTT.Client(brokerUrl, userAgentID);

client.onConnectionLost = onConnectionLost;
client.connect({
    onSuccess: onConnect,
    onFailure: onFailure,
    userName: "tyffon_mirrorge",
    password: "tyffon1111",
});

// �ڑ�������
function onConnect() {
    console.log("Connected to MQTT broker");
    statusDiv.innerHTML = "Connected to MQTT broker";
}

// �ڑ����s��
function onFailure(responseObject) {
    console.log("Failed to connect to MQTT broker: " + responseObject.errorMessage);
    statusDiv.innerHTML = "Failed to connect to MQTT broker: " + responseObject.errorMessage;
}

// �ؒf��
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("Connection lost: " + responseObject.errorMessage);
        statusDiv.innerHTML = "Connection lost: " + responseObject.errorMessage;
    }
}

// ���b�Z�[�W�̑��M
function publishMessage(topic, payload) {
    const message = new Paho.MQTT.Message(payload);
    message.destinationName = topic;
    client.send(message);
    // console.log(`Message published: Topic: ${topic}, Payload: ${payload}`)
}

// ���b�Z�[�W�|�[�����O�p
let pollingPublishMessage = null;

// �|�[�����O�J�n
function startPolling() {
    // �{�^����Ԃ�؂�ւ�
    pollingStatusDiv.innerHTML = "Polling Started";
    pollingStartButton.disabled = !pollingStartButton.disabled;
    pollingStopButton.disabled = !pollingStopButton.disabled;
    // ��񐶐�
    playerCount = parseInt(pollingCountInput.value);
    createPollingInfo(playerCount);
    // ���b�Z�[�W�Ăяo���J�n
    publishDeviceMessage();
}

// �|�[�����O�I��
function stopPolling() {
    // ���b�Z�[�W�Ăяo�����~
    clearTimeout(pollingPublishMessage);
    pollingPublishMessage = null;
    // �����폜
    Object.keys(players).forEach(key => {
        pollingList.removeChild(pollingList.querySelector(`#${key}`));
        delete players[key];
    })
    // �{�^����Ԃ�؂�ւ�
    pollingStartButton.disabled = !pollingStartButton.disabled;
    pollingStopButton.disabled = !pollingStopButton.disabled;
    pollingStatusDiv.innerHTML = "Polling Stopped.";
}

// �|�[�����O�����쐬
function createPollingInfo(count) {
    for (let i = 1; i < count + 1; i++) {
        const uid = `uid${i}`;

        // �f�o�C�X�����쐬
        const batteryLevel = Math.random();
        const batteryStatus = Math.floor(Math.random() * 4) + 1;
        const thermal = Math.floor(Math.random() * 4);
        const deviceInfo = createDeviceInfo(batteryLevel, batteryStatus, thermal, "Test Vision Pro", `Test ${i}`, uid, "MacOS");
        const gameInfo = createGameInfo();
        // �ʒu�����쐬
        const posX = (Math.random() - 0.5) * 200.0;
        const posY = (Math.random() - 0.5) * 100.0;
        const angle = Math.random() * 360;
        players[uid] = { posX, posY, angle, deviceInfo, gameInfo };

        // ���X�g�ɗv�f��ǉ�
        const itemHeader = document.createElement('h3');
        itemHeader.innerText = `Player ${i}`;

        const itemBody = document.createElement('dl');
        itemBody.innerHTML = createListItemBodyHtml(uid);

        const listItem = document.createElement('li');
        listItem.id = uid;
        listItem.appendChild(itemHeader);
        listItem.appendChild(itemBody);

        // ���X�g���ڂ�ǉ�
        pollingList.appendChild(listItem);
    }
}

// ���b�Z�[�W�̍쐬
function publishDeviceMessage() {
    // ���b�Z�[�W���M����
    Object.keys(players).forEach(key => {
        // �g�s�b�N�쐬
        const topic = topicRoot + key;
        const player = players[key];

        // �����_���ړ�
        const diffX = (Math.random() - 0.5) * 10.0;
        const diffY = (Math.random() - 0.5) * 10.0;
        const diffAngle = Math.atan2(diffX, diffY) * 180 / Math.PI;
        player.posX += diffX;
        player.posY += diffY;
        player.angle = diffAngle;

        // �y�C���[�h���쐬
        const payload = createPayloadBytes(player.posX, player.posY, player.angle, player.deviceInfo, player.gameInfo);
        publishMessage(topic, payload);

        // �\�������X�V
        const listItem = pollingList.querySelector(`#${key}`);
        const itemBody = listItem.querySelector('dl');
        itemBody.innerHTML = createListItemBodyHtml(key);
    });
    // ���̃��b�Z�[�W���M���X�P�W���[��
    pollingPublishMessage = setTimeout(publishDeviceMessage, pollingInterval);
}

// ���X�g���ڂ̒��g���쐬
function createListItemBodyHtml(uid) {
    const player = players[uid];
    let bodyHtml = `<dt>Position</dt><dd>(${player.posX}, ${player.posY})</dd>`
    bodyHtml += `<dt>Angle</dt><dd>${player.angle}</dd>`;
    bodyHtml += `<dt>Device Model</dt><dd>${player.deviceInfo.deviceModel}</dd>`;
    bodyHtml += `<dt>Device Name</dt><dd>${player.deviceInfo.deviceName}</dd>`;
    bodyHtml += `<dt>Device ID</dt><dd>${player.deviceInfo.deviceUniqueIdentifier}</dd>`;
    bodyHtml += `<dt>OS</dt><dd>${player.deviceInfo.operatingSystem}</dd>`;
    bodyHtml += `<dt>Battery Level</dt><dd>${(player.deviceInfo.batteryLevel * 100).toFixed(0)}%</dd>`;
    bodyHtml += `<dt>Battery Status</dt><dd>${batteryStatusMap[player.deviceInfo.batteryStatus]}</dd>`;
    bodyHtml += `<dt>Thermal Status</dt><dd>${thermalStatusMap[player.deviceInfo.thermalStatus]}</dd>`;
    return bodyHtml;
}

// �f�o�C�X���̍쐬
function createDeviceInfo(batteryLevel, batteryStatus, thermalStatus, model, name, uid, os) {
    return {
        batteryLevel: batteryLevel,
        batteryStatus: batteryStatus,
        thermalStatus: thermalStatus,
        deviceModel: model,
        deviceName: name,
        deviceUniqueIdentifier: uid,
        operatingSystem: os
    }
}

function createGameInfo() {
    return {
        status: "Playing",
        time: 0,
    }
}

// �ʒu����JSON�̍쐬
function createPayloadBytes(posX, posY, angle, deviceInfo, gameInfo) {
    const telemetry = {
        posX: posX,
        posY: posY,
        angle: angle,
        deviceInfo: deviceInfo,
        gameInfo: gameInfo,
        appVersion : "test",
        sessionName : "ABCS"
    };
    const jsonString = JSON.stringify(telemetry)
    return encoder.encode(jsonString)
}