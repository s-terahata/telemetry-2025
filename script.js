// DOM要素の取得
const statusDiv = document.getElementById('status');
const coordinatesDiv = document.getElementById('coordinates');
const deviceList = document.getElementById('deviceList');
const map = document.getElementById('map');
const mapContainer = document.getElementById('mapContainer');
const popup = document.getElementById('popup');
const deviceInfoDiv = document.getElementById('deviceInfo');
const forceStopButton = document.getElementById('forceStopButton');
const mapInfoDiv = document.getElementById('mapInfo');
const grantAdminButton = document.getElementById('grantAdminButton');
const revokeAdminButton = document.getElementById('revokeAdminButton');
const grantMarkerHostButton = document.getElementById('grantMarkerHostButton');
const revokeMarkerHostButton = document.getElementById('revokeMarkerHostButton');

// MQTTブローカーのURL
const mqttBrokerUrl = "wss://x41e9ae7.ala.asia-southeast1.emqxsl.com:8084/mqtt";
const subscribeTopic = "player/telemetry/#";
const posScaleX = 4.4;
const posScaleY = -4.4;
const posOffsetX = 62;
const posOffsetY = 66;
const rotOffsetY = -120;
const mqttBrokerID = "tyffon_mirrorge";
const mqttBrokerPW = "tyffon1111";
const userAgentID = navigator.userAgent + "_" + new Date().getTime();

// deviceLabelsの最後の3桁を取得する関数
function getLastThreeDigits(label) {
    // ラベル内の数字部分（1つ以上の連続した数字）を探す
    const match = label.match(/\d+/);
    if (match) {
        // 見つかった数字から先頭の0を除去して返す
        return parseInt(match[0], 10).toString(); // 数字を整数としてパースしてから文字列に変換
    }
    return ""; // 数字が見つからない場合は"未定義"
}

function getSequenceName(seconds, status) {
    if(status == "Playing" && seconds > 80)
        seconds -= 35; //MainTimelineの開始位置がオフセットされているため

    if(status == "Playing"){
    if (seconds <= 80) {
        return "チュートリアル";
    } else if (seconds <= 300) {
        return "フリーローム";
    } else if (seconds >= 310 && seconds <= 380) {
        return "ゆがみ襲来";
    } else if(seconds <= 416) {
        return "ポータルを復活させる";
    } else if(seconds <= 440) {
        return "ポータルをくぐる";
    } else if(seconds <= 595) {
        return "ミニライド";
    } else if(seconds < 680) {
        return "ファイナルライド前";
    } else if (seconds <= 860) {
        return "ファイナルライド";
    } else if (seconds <= 1010) {
        return "エンディング";
    }
}
else
{
    if (seconds <= 0) {
        return "カートタッチ前";
    } else {
        return "開始コマンド待機中"
    }
}

    return "体験終了";
}

// バッテリー状態マップ
const batteryStatusMap = {
    "0": "不明",
    "1": "充電中",
    "2": "放電中",
    "3": "充電していません",
    "4": "満充電"
};

// 温度状態マップ
const thermalStatusMap = {
    "-1": "不明",
    "0": "正常",
    "1": "やや注意",
    "2": "注意（不安定）",
    "3": "危険（停止の恐れ）"
};

// ビューポートのサイズ
let viewportOriginWidth = 0;
let viewportOriginHeight = 0;
let viewportWidth = 0;
let viewportHeight = 0;

let isDragging = false;
let startX, startY;

let mapX = 0, mapY = 0;
let scale = 1;

const players = {};
const timeoutTimers = {};
let playerCount = 0;
const logData = {};

// 選択されたユーザーID
let selectedUserId = null;

// メニュー関連の要素を取得
const menuButton = document.getElementById('menuButton');
const closeMenuButton = document.getElementById('closeMenuButton');
const informations = document.getElementById('informations');

// ポップアップ関連の要素を取得
const overlay = document.getElementById('overlay');
const closePopupButton = document.getElementById('closePopupButton');

const selectedSessions = new Set();

document.addEventListener('gesturestart', function (e) {
    e.preventDefault();
});

document.addEventListener('gesturechange', function (e) {
    e.preventDefault();
});

document.addEventListener('gestureend', function (e) {
    e.preventDefault();
});

document.addEventListener('touchmove', function (e) {
    if (e.scale !== 1) {
        e.preventDefault();
    }
}, { passive: false });


// ウィンドウロード時の処理
window.addEventListener('load', () => {
    viewportWidthOrigin = window.innerWidth;
    viewportHeightOrigin = window.innerHeight;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    
    // メニューをデフォルトで開いた状態にする
    menuButton.classList.add('active');
    informations.classList.add('active');
});

// ビューポートのサイズ変更時の処理
window.addEventListener('resize', () => {
    const diffX = window.innerWidth - viewportWidth;
    const diffY = window.innerHeight - viewportHeight;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    Object.keys(players).forEach(key => {
        // ピクセルベースの座標調整
        const player = players[key];
        player.x += diffX / 2;
        player.y += diffY / 2;
        // マーカー座標の更新
        const marker = player.marker;
        marker.style.left = `${player.x}px`;
        marker.style.top = `${player.y}px`;
    });
});

// マップ上でマウスボタン押下時の処理
map.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - mapX;
    startY = e.clientY - mapY;
    map.style.cursor = 'grabbing';
});

// マップ上でマウス移動時の処理
map.addEventListener('mousemove', (e) => {
    if (isDragging) {
        mapX = e.clientX - startX;
        mapY = e.clientY - startY;
        changeMapTransform();
    }
});

// マップ上でマウスボタンを離したときの処理
map.addEventListener('mouseup', () => {
    isDragging = false;
    map.style.cursor = 'grab';
});

// マップ上でマウスホイールを使用したときの処理
map.addEventListener('wheel', (e) => {
    e.preventDefault();
    const scaleAmount = 0.1;
    scale += e.deltaY > 0 ? -scaleAmount : scaleAmount;
    scale = Math.min(Math.max(0.5, scale), 5);
    changeMapTransform();
});

// マップの変形を更新する関数
function changeMapTransform() {
    map.style.transform = `translate(${mapX}px, ${mapY}px) scale(${scale})`;
}

// MQTTクライアントのインスタンス生成
const client = new Paho.MQTT.Client(mqttBrokerUrl, userAgentID);

client.onConnectionLost = onConnectionLost;
client.onMessageArrived = onMessageArrived;
client.connect({
    onSuccess: onConnect,
    onFailure: onFailure,
    userName: mqttBrokerID,
    password: mqttBrokerPW,
});

// メッセージ送信関数
function publishMessage(topic, payload) {
    const message = new Paho.MQTT.Message(payload);
    message.destinationName = topic;
    message.qos = 1;
    client.send(message);
    console.log(`メッセージ送信: トピック: ${topic}, ペイロード: ${payload}`);
}

// 接続成功時の処理
function onConnect() {
    console.log("管理サーバーに接続しました");
    statusDiv.innerHTML = "管理サーバーに接続しました";
    client.subscribe(subscribeTopic);
}

// 接続失敗時の処理
function onFailure(responseObject) {
    console.log("管理サーバーへの接続に失敗しました: " + responseObject.errorMessage);
    statusDiv.innerHTML = "管理サーバーへの接続に失敗しました: " + responseObject.errorMessage;
}

// 接続切断時の処理
function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.log("接続が失われました: " + responseObject.errorMessage);
        statusDiv.innerHTML = "接続が失われました: " + responseObject.errorMessage;
        // 再接続を試みる
        attemptReconnect();
    }
}

// 再接続を試みる関数
function attemptReconnect() {
    console.log("再接続を試みています...");
    statusDiv.innerHTML = "再接続を試みています...";
    client.connect({
        onSuccess: onConnect,
        onFailure: function (responseObject) {
            console.log("再接続に失敗しました: " + responseObject.errorMessage);
            statusDiv.innerHTML = "再接続に失敗しました: " + responseObject.errorMessage;
            // 再試行までの待機時間
            setTimeout(attemptReconnect, 5000);
        },
        userName: mqttBrokerID,
        password: mqttBrokerPW,
    });
}

// メッセージ到着時の処理
function onMessageArrived(message) {
    const topic = message.destinationName;
    if (!topic.startsWith("player/telemetry/")) {
        return;
    }
    const telemetry = JSON.parse(message.payloadString);
    const userId = telemetry.deviceInfo.deviceUniqueIdentifier;

    // 開発者モードがOFFの時は、開発版デバイスのメッセージを無視
    if (!isDevMode && !telemetry.appVersion.includes("Pro")) {
        // 既に表示されているデバイスなら削除
        if (players[userId]) {
            removePlayer(userId);
        }
        return;
    }

    // プレイヤーのタイムアウトタイマーをリセットまたは開始
    resetTimeoutTimer(userId);

    const timestamp = new Date().toISOString();
    if (!logData[userId]) {
        logData[userId] = [];
    }
    logData[userId].push(`[${timestamp}] トピック: ${topic}, メッセージ: ${message.payloadString}`);

    const rawX = (telemetry.posX * posScaleX) + posOffsetX;
    const rawY = (telemetry.posY * posScaleY) + posOffsetY;
    const rotated = applyRotationOffset(rawX, rawY, rotOffsetY, posOffsetX, posOffsetY);
    const x = rotated.x;
    const y = rotated.y;
    const rotation = telemetry.angle + rotOffsetY;

    if (!players[userId]) {
        const nextNumber = getNextPlayerNumber();
        playerCount++;
        updatePlayerCountUI();

        // マップにマーカーを追加
        const marker = document.createElement('div');
        marker.className = 'marker';
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        marker.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;

        // プレイヤー番号をマーカーに追加
        const playerNumber = document.createElement('div');
        playerNumber.className = 'player-number';
        playerNumber.innerText = nextNumber;
        marker.appendChild(playerNumber);
        playerNumber.style.transform = `translate(-50%, -50%) rotate(${-rotation}deg)`;

        // アイコンとimgタグを挿入
        const icon = document.createElement('img');
        icon.src = 'player.png';
        icon.className = 'player-icon';
        marker.appendChild(icon);

        // マーカークリック時の処理
        marker.addEventListener('click', () => {
            onSelectDevice(userId, telemetry.deviceInfo);
            scrollSelectItem(userId);
        });
        map.appendChild(marker);

        // リストにデバイス情報を追加
        const listItem = createListItem(nextNumber, telemetry.deviceInfo, telemetry.gameInfo, telemetry.sessionName);
        // リストアイテムのクリック処理
        listItem.addEventListener('click', () => {
            onSelectDevice(userId, telemetry.deviceInfo);
        });
        deviceList.appendChild(listItem);

        // プレイヤー情報を更新
        players[userId] = { number: nextNumber, marker, listItem, x, y, rotation, deviceInfo: telemetry.deviceInfo, appVersion: telemetry.appVersion, sessionName: telemetry.sessionName };
        updateSessionList(); // セッションリストを更新
    } else {
        // 既存プレイヤーの情報を更新
        const marker = players[userId].marker;
        animateMarker(marker, players[userId], { x, y, rotation });
        const listItem = players[userId].listItem;
        updateListItem(listItem, telemetry.deviceInfo, telemetry.gameInfo, telemetry.sessionName);
        players[userId] = { number: players[userId].number, marker, listItem, x, y, rotation, deviceInfo: telemetry.deviceInfo, appVersion: telemetry.appVersion, sessionName: telemetry.sessionName };
        updateSessionList(); // セッションリストを更新
    }

    // 現在のユーザーのデバイス情報を表示
    if (popup.style.display === 'block' && selectedUserId === userId) {
        showDeviceInfo(players[userId]);
    }
}

// マーカークリック時のリスト
function onSelectDevice(userId) {
    selectedUserId = userId;
    changeSelectPlayer();
    showDeviceInfo(players[userId]);
}

// プレイヤー選択時のUI更新
function changeSelectPlayer() {
    Object.keys(players).forEach(key => {
        players[key].marker.classList.remove('selected');
        players[key].listItem.classList.remove('selected');
    });
    players[selectedUserId].marker.classList.add('selected');
    players[selectedUserId].listItem.classList.add('selected');
    //focusPlayerMarker(selectedUserId);
}

// 選択したアイテムまでスクロール
function scrollSelectItem(userId) {
    const itemRect = players[userId].listItem.getBoundingClientRect();
    const containerRect = deviceList.getBoundingClientRect();
    const scrollTo = itemRect.top - containerRect.top + deviceList.scrollTop;
    deviceList.scrollTo({
        top: scrollTo,
        behavior: 'smooth'
    });
}

// 選択したマーカーを中央に表示
function focusPlayerMarker(userId) {
    const marker = players[userId].marker;
    // マップの中央
    const mapRect = map.getBoundingClientRect();
    const mapCenterX = mapRect.left + mapRect.width / 2;
    const mapCenterY = mapRect.top + mapRect.height / 2;
    // マーカーの中央
    const markerRect = marker.getBoundingClientRect();
    const markerCenterX = markerRect.left + markerRect.width / 2;
    const markerCenterY = markerRect.top + markerRect.height / 2;
    // 座標の計算
    mapX = Math.floor(mapCenterX - markerCenterX);
    mapY = Math.floor(mapCenterY - markerCenterY);

    changeMapTransform();
}

// タイムアウトタイマーのリセット
function resetTimeoutTimer(userId) {
    if (timeoutTimers[userId]) {
        clearTimeout(timeoutTimers[userId]);
    }
    timeoutTimers[userId] = setTimeout(() => {
        removePlayer(userId);
    }, 10000); // 10秒
}

// プレイヤーの削除
function removePlayer(userId) {
    if (players[userId]) {
        deviceList.removeChild(players[userId].listItem);
        map.removeChild(players[userId].marker);
        delete players[userId];
        delete logData[userId];
        delete timeoutTimers[userId];
        playerCount--;
        updatePlayerCountUI();
        updateSessionList(); // セッションリストを更新
    }
}

// 角度の正規化
function normalizeAngle(angle) {
    return ((angle + 180) % 360 + 360) % 360 - 180;
}

// マーカーのアニメーション
function animateMarker(marker, from, to, duration = 1000) {
    const startTime = performance.now();
    const playerNumber = marker.querySelector('.player-number');

    function animate(time) {
        const elapsed = time - startTime;
        const t = Math.min(elapsed / duration, 1);
        const newX = from.x + (to.x - from.x) * t;
        const newY = from.y + (to.y - from.y) * t;

        const angleDiff = normalizeAngle(to.rotation - from.rotation);
        const newRotation = from.rotation + angleDiff * t;

        marker.style.left = `${newX}%`;
        marker.style.top = `${newY}%`;
        marker.style.transform = `translate(-50%, -50%) rotate(${newRotation}deg)`;
        
        if (playerNumber) {
            playerNumber.style.transform = `translate(-50%, -50%) rotate(${-newRotation}deg)`;
        }


        if (t < 1) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

// リストアイテムの生成
function createListItem(playerCount, deviceInfo, gameInfo, sessionName) {
    const itemHeader = document.createElement('h3');
    const deviceId = deviceInfo.deviceUniqueIdentifier;
    const labelName = deviceId;

    // OSに応じたアイコンを決定
    let platformIcon = 'fa-question-circle'; // デフォルト
    const os = deviceInfo.operatingSystem.toLowerCase();
    if (os.includes('vision')) {
        platformIcon = 'fa-vr-cardboard';
    } else if (os.includes('ios')) {
        platformIcon = 'fa-mobile-alt';
    } else if (os.includes('mac')) {
        platformIcon = 'fa-laptop';
    } else if (os.includes('windows')) {
        platformIcon = 'fa-windows';
    }

    itemHeader.innerHTML = `<i class="fas ${platformIcon}"></i> ${labelName}`;

    const itemBody = document.createElement('dl');
    itemBody.classList.add("definition-list");
    itemBody.innerHTML = createListItemHtml(deviceInfo, gameInfo, sessionName);

    const listItem = document.createElement('li');
    listItem.classList.add('information');
    listItem.appendChild(itemHeader);
    listItem.appendChild(itemBody);

    return listItem;
}

// リストアイテムの更新
function updateListItem(listItem, deviceInfo, gameInfo, sessionName) {
    const itemBody = listItem.querySelector(".definition-list");
    itemBody.innerHTML = createListItemHtml(deviceInfo, gameInfo, sessionName);
}

// リストアイテムのHTML生成
function createListItemHtml(deviceInfo, gameInfo, sessionName) {
    const sequenceName = getSequenceName(gameInfo.time, gameInfo.status);
    const timelineProgress = Math.min((gameInfo.time / 1045) * 100, 100);
    const batteryProgress = deviceInfo.batteryLevel * 100;
    
    let itemText = `<div class="no-indent"><i class="fas fa-door-open"></i> ${sessionName}</div>`;
    itemText += `<div class="no-indent"><i class="fas fa-clapperboard"></i> ${sequenceName}</div>`;
    itemText += `<div class="progress-container">
        <div class="progress-icon"><i class="fas fa-clock"></i></div>
        <div class="progress-bar-container">
            <div class="progress-bar" style="width: ${timelineProgress}%"></div>
            <div class="progress-value">${formatTime(gameInfo.time)}</div>
        </div>
    </div>`;
    itemText += `<div class="progress-container">
        <div class="progress-icon"><i class="fas fa-battery-full"></i></div>
        <div class="progress-bar-container">
            <div class="progress-bar battery-progress" style="width: ${batteryProgress}%"></div>
            <div class="progress-value">${batteryProgress.toFixed(0)}%</div>
        </div>
    </div>`;
    return itemText;
}

// プレイヤー数UIの更新
function updatePlayerCountUI() {
    coordinatesDiv.innerHTML = `接続中デバイス: ${playerCount}`;
}

// デバイス情報の表示
function showDeviceInfo(player) {
    const deviceInfo = player.deviceInfo;
    const header = popup.querySelector(".popup-header h2");
    const deviceId = deviceInfo.deviceUniqueIdentifier;
    header.innerHTML = deviceId;

    const body = deviceInfoDiv.querySelector(".definition-list");
    let info = `<dt>デバイスモデル</dt><dd>${deviceInfo.deviceModel}</dd>`;
    info += `<dt>デバイス名</dt><dd>${deviceInfo.deviceName}</dd>`;
    info += `<dt>デバイスID</dt><dd>${deviceInfo.deviceUniqueIdentifier}</dd>`;
    info += `<dt>OS</dt><dd>${deviceInfo.operatingSystem}</dd>`;
    info += `<dt>バッテリーレベル</dt><dd>${(deviceInfo.batteryLevel * 100).toFixed(0)}%</dd>`;
    info += `<dt>バッテリー状態</dt><dd>${batteryStatusMap[deviceInfo.batteryStatus]}</dd>`;
    info += `<dt>温度状態</dt><dd>${thermalStatusMap[deviceInfo.thermalStatus]}</dd>`;
    info += `<dt>アプリバージョン</dt><dd>${player.appVersion}</dd>`;
    info += `<dt>セッション名</dt><dd>${player.sessionName}</dd>`;
    body.innerHTML = info;

    showPopup();
}

// ポップアップを表示する関数
function showPopup() {
    popup.style.display = 'block';
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// ポップアップを非表示にする関数
function hidePopup() {
    popup.style.display = 'none';
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

// 閉じるボタンのクリックイベント
closePopupButton.addEventListener('click', hidePopup);

// オーバーレイのクリックイベント
overlay.addEventListener('click', hidePopup);

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

// 回転を適用する関数
function applyRotationOffset(x, y, angle, centerX, centerY) {
    const radians = angle * Math.PI / 180; // 角度をラジアンに変換
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);

    const dx = x - centerX;
    const dy = y - centerY;

    const rotatedX = cos * dx - sin * dy + centerX;
    const rotatedY = sin * dx + cos * dy + centerY;

    return { x: rotatedX, y: rotatedY };
}

// セッション名の更新
function updateSessionList() {
    const sessions = new Set();
    Object.values(players).forEach(player => {
        // セッション名が存在する場合のみ追加
        if (player.sessionName !== undefined && player.sessionName !== null) {
            sessions.add(player.sessionName);
        }
    });
    
    return Array.from(sessions);
}

// メニューボタンのクリックイベント
menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    menuButton.classList.toggle('active');
    informations.classList.toggle('active');
});

// メニュー内のクリックイベントの伝播を停止
informations.addEventListener('click', (e) => {
    e.stopPropagation();
});

// タッチ操作の変数
let touchStartX = 0;
let touchStartY = 0;
let lastTouchDistance = 0;
let initialScale = 1;

// タッチ開始時の処理
map.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        // シングルタッチ - ドラッグ
        isDragging = true;
        touchStartX = e.touches[0].clientX - mapX;
        touchStartY = e.touches[0].clientY - mapY;
    } else if (e.touches.length === 2) {
        // マルチタッチ - ピンチズーム
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        lastTouchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        initialScale = scale;
    }
}, { passive: false });

// タッチ移動時の処理
map.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
        // シングルタッチ - ドラッグ
        mapX = e.touches[0].clientX - touchStartX;
        mapY = e.touches[0].clientY - touchStartY;
        changeMapTransform();
    } else if (e.touches.length === 2) {
        // マルチタッチ - ピンチズーム
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        
        if (lastTouchDistance > 0) {
            const scaleFactor = currentDistance / lastTouchDistance;
            scale = Math.min(Math.max(0.5, initialScale * scaleFactor), 5);
            changeMapTransform();
        }
    }
}, { passive: false });

// タッチ終了時の処理
map.addEventListener('touchend', (e) => {
    e.preventDefault();
    isDragging = false;
    lastTouchDistance = 0;
}, { passive: false });

// 確認ダイアログを表示する関数
function showConfirmationDialog(message, sessions, callback) {
    // オーバーレイとダイアログの作成
    const overlay = document.createElement('div');
    overlay.className = 'custom-dialog-overlay';
    
    const dialog = document.createElement('div');
    dialog.className = 'custom-dialog';
    
    // ダイアログの内容
    dialog.innerHTML = `
        <div class="custom-dialog-content">
            <div class="custom-dialog-message">${message}</div>
            <select class="custom-dialog-session-select">
                <option value="">セッションを選択してください</option>
                ${sessions.map(session => `<option value="${session}">${session}</option>`).join('')}
            </select>
            <div class="device-list-container" style="display: none;">
                <div class="device-list-title">送信対象デバイス:</div>
                <ul class="device-list"></ul>
            </div>
        </div>
        <div class="custom-dialog-buttons">
            <button class="custom-dialog-button custom-dialog-cancel">キャンセル</button>
            <button class="custom-dialog-button custom-dialog-confirm">送信</button>
        </div>
    `;
    
    // デバイスリストコンテナーの参照を取得
    const deviceListContainer = dialog.querySelector('.device-list-container');
    const deviceList = dialog.querySelector('.device-list');
    
    // セッション選択のイベントリスナー
    dialog.querySelector('.custom-dialog-session-select').addEventListener('change', (e) => {
        e.stopPropagation();
        const selectedSession = e.target.value;
        
        // デバイスリストを更新
        deviceList.innerHTML = '';
        const filteredPlayers = Object.entries(players).filter(([_, player]) => 
            (player.sessionName) === selectedSession
        );
        
        if (filteredPlayers.length > 0) {
            filteredPlayers.forEach(([userId, _]) => {
                const li = document.createElement('li');
                li.className = 'device-list-item';
                li.textContent = userId;
                deviceList.appendChild(li);
            });
            deviceListContainer.style.display = 'block';
        } else {
            deviceListContainer.style.display = 'none';
        }
    });
    
    // ダイアログをオーバーレイに追加
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 背面の操作を禁止
    document.body.style.overflow = 'hidden';
    
    // キャンセルボタンのイベントリスナー
    dialog.querySelector('.custom-dialog-cancel').addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.removeChild(overlay);
        document.body.style.overflow = '';
        callback(false, []);
    });
    
    // 送信ボタンのイベントリスナー
    dialog.querySelector('.custom-dialog-confirm').addEventListener('click', (e) => {
        e.stopPropagation();
        const selectElement = dialog.querySelector('.custom-dialog-session-select');
        const selectedIndex = selectElement.selectedIndex;
        
        // デフォルトの選択肢（「セッションを選択してください」）が選択されている場合のみアラートを表示
        if (selectedIndex === 0) {
            alert('セッションを選択してください');
            return;
        }
        
        const selectedSession = selectElement.value;
        document.body.removeChild(overlay);
        document.body.style.overflow = '';
        callback(true, [selectedSession]);
    });
    
    // ダイアログのクリックイベント
    dialog.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // オーバーレイクリックでダイアログを閉じる
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            document.body.style.overflow = '';
            callback(false, []);
        }
    });
}

// ゲーム開始ボタンの処理を更新
document.getElementById('startAllButton').addEventListener('click', () => {
    const sessions = updateSessionList();
    const message = 'ゲーム開始コマンドを送信します。\n送信先セッションを選択してください。';
    showConfirmationDialog(message, sessions, (confirmed, selectedSessions) => {
        if (confirmed && selectedSessions.length > 0) {
            const filteredPlayers = Object.keys(players).filter(userId => 
                selectedSessions.includes(players[userId].sessionName)
            );
            startAllDevices(filteredPlayers);
        }
    });
});

// チュートリアル開始ボタンの処理を更新
document.getElementById('startTutorialAllButton').addEventListener('click', () => {
    const sessions = updateSessionList();
    const message = 'チュートリアル開始コマンドを送信します。\n送信先セッションを選択してください。';
    showConfirmationDialog(message, sessions, (confirmed, selectedSessions) => {
        if (confirmed && selectedSessions.length > 0) {
            const filteredPlayers = Object.keys(players).filter(userId => 
                selectedSessions.includes(players[userId].sessionName)
            );
            startTutorialAllDevices(filteredPlayers);
        }
    });
});

// ゲーム開始関数を更新
function startAllDevices(filteredPlayers) {
    let playerIdx = 0;
    filteredPlayers.forEach(userId => {
        const topic = `command/${userId}/start`;
        const payload = JSON.stringify({ playerIndex: playerIdx });
        publishMessage(topic, payload);
        console.log(`メッセージをデバイスID ${userId} に送信しました。トピック: ${topic}, ペイロード: ${payload}`);
        playerIdx++;
    });
}

// チュートリアル開始関数を更新
function startTutorialAllDevices(filteredPlayers) {
    let playerIdx = 1;
    filteredPlayers.forEach(userId => {
        const topic = `command/${userId}/tutorial`;
        const payload = JSON.stringify({ playerIndex: playerIdx });
        publishMessage(topic, payload);
        console.log(`メッセージをデバイスID ${userId} に送信しました。トピック: ${topic}, ペイロード: ${payload}`);
        playerIdx++;
    });
}

// 開発者モード関連の要素を取得
const toggleDevModeButton = document.getElementById('toggleDevMode');
const startTutorialAllButton = document.getElementById('startTutorialAllButton');

// 開発者モードの状態を管理
let isDevMode = false;

// 開発者モードの切り替え
toggleDevModeButton.addEventListener('click', () => {
    isDevMode = !isDevMode;
    toggleDevModeButton.classList.toggle('active', isDevMode);
    startTutorialAllButton.classList.toggle('hidden', !isDevMode);
});

// プレイヤー番号の重複を防ぐ関数
function getNextPlayerNumber() {
    const usedNumbers = new Set(Object.values(players).map(p => p.number));
    let num = 1;
    while (usedNumbers.has(num)) {
        num++;
    }
    return num;
}