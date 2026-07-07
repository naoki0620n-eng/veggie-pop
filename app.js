'use strict';

// ==== 定数 ====
var API_URL = 'https://api.anthropic.com/v1/messages';
var API_KEY_STORAGE = 'anthropic_api_key';
var MODEL = 'claude-sonnet-5';
var MAX_NAME_LENGTH = 100;
var IMAGE_MAX_SIDE = 1024;
var IMAGE_QUALITY = 0.8;

var SYSTEM_PROMPT =
  'あなたはスーパー・八百屋の青果売り場のPOP作成のプロです。写真および/または商品名から、店頭に貼るPOPの内容を作成します。必ず以下のJSONオブジェクトだけを返してください。前後に説明文やコードフェンスを付けないこと。\n形式: {"商品名":"商品名","絵文字":"商品を表す絵文字1つ","産地":"産地表記","pop一言":"手書きPOPにそのまま書ける20字前後のキャッチコピー","料理":[{"名前":"料理名","説明":"10〜20字の簡単な説明"},{"名前":"料理名","説明":"10〜20字の簡単な説明"}]}\n\n産地の書き方（店頭に掲示されるため誤情報は厳禁）:\n- 写真のラベル・箱・値札などから産地が確実に判別できた場合のみ、その産地を断定して書く。\n- 判別できない場合は推測で断定せず、「代表的な産地: ○○など」の形式で書く。\n- 商品名に地名や産地が含まれる場合は、必ずそれをそのまま尊重する。\n\nその他:\n- 写真がある場合は写真から商品を判別する。商品名の補足があればそれも考慮する。\n- 知らない品種・商品名の場合は、そのカテゴリの一般的な内容として書く。\n- 料理は必ず2品。料理名と10〜20字程度の簡単な説明をつける。';

// ==== 状態 ====
var els = {};
var currentImageData = null; // 縮小後のdataURL（プレビュー兼API送信用）
var currentEmoji = '';

// ==== 要素参照 ====
function initElements() {
  els.input = document.getElementById('productInput');
  els.generateBtn = document.getElementById('generateBtn');
  els.message = document.getElementById('message');
  els.results = document.getElementById('results');
  els.placeholder = document.getElementById('placeholder');
  els.photoInput = document.getElementById('photoInput');
  els.preview = document.getElementById('preview');
  els.previewImg = document.getElementById('previewImg');
  els.removePhotoBtn = document.getElementById('removePhotoBtn');
  els.outEmoji = document.getElementById('out-emoji');
  els.outName = document.getElementById('out-name');
  els.outOrigin = document.getElementById('out-origin');
  els.outPop = document.getElementById('out-pop');
  els.outDish1Name = document.getElementById('out-dish1-name');
  els.outDish1Desc = document.getElementById('out-dish1-desc');
  els.outDish2Name = document.getElementById('out-dish2-name');
  els.outDish2Desc = document.getElementById('out-dish2-desc');
  els.shareBtn = document.getElementById('shareBtn');
  els.copyShareBtn = document.getElementById('copyShareBtn');
  els.settingsBtn = document.getElementById('settingsBtn');
  els.settingsModal = document.getElementById('settingsModal');
  els.apiKeyInput = document.getElementById('apiKeyInput');
  els.keyStatus = document.getElementById('keyStatus');
  els.saveKeyBtn = document.getElementById('saveKeyBtn');
  els.closeSettingsBtn = document.getElementById('closeSettingsBtn');
}

// ==== APIキー管理 ====
function getApiKey() {
  try {
    return (localStorage.getItem(API_KEY_STORAGE) || '').trim();
  } catch (e) {
    return '';
  }
}

function setApiKey(key) {
  try {
    localStorage.setItem(API_KEY_STORAGE, key);
  } catch (e) {
    // ストレージ不可時は無視
  }
}

// ==== メッセージ表示 ====
function clearMessage() {
  els.message.hidden = true;
  els.message.textContent = '';
  els.message.classList.remove('info');
}

function showError(text, withSettingsLink) {
  els.message.classList.remove('info');
  els.message.textContent = text;
  if (withSettingsLink) {
    var btn = document.createElement('button');
    btn.className = 'inline-link';
    btn.textContent = '設定を開く';
    btn.addEventListener('click', openSettings);
    els.message.appendChild(document.createTextNode(' '));
    els.message.appendChild(btn);
  }
  els.message.hidden = false;
}

// ==== ローディング ====
function setLoading(loading) {
  els.generateBtn.disabled = loading;
  if (loading) {
    els.generateBtn.innerHTML = '<span class="spinner"></span>生成中…';
  } else {
    els.generateBtn.textContent = 'POPを作る';
  }
}

// ==== 画像の縮小・base64化 ====
// 長辺IMAGE_MAX_SIDE程度・JPEG品質IMAGE_QUALITYに縮小したdataURLを返す
function loadAndResizeImage(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('bad-image'));
          return;
        }
        var scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          resolve(canvas.toDataURL('image/jpeg', IMAGE_QUALITY));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = function () { reject(new Error('image-load')); };
      img.src = reader.result;
    };
    reader.onerror = function () { reject(new Error('file-read')); };
    reader.readAsDataURL(file);
  });
}

function handlePhotoChange(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  clearMessage();
  loadAndResizeImage(file)
    .then(function (dataUrl) {
      currentImageData = dataUrl;
      els.previewImg.src = dataUrl;
      els.preview.hidden = false;
    })
    .catch(function () {
      showError('画像の読み込みに失敗しました。別の写真をお試しください');
    });
}

function removePhoto() {
  currentImageData = null;
  els.photoInput.value = '';
  els.previewImg.removeAttribute('src');
  els.preview.hidden = true;
}

// ==== JSON抽出 ====
// コードフェンス等を含む可能性のあるテキストから最初の { と最後の } を取り出してパース
function parseModelJson(raw) {
  var text = String(raw == null ? '' : raw).trim();
  var start = text.indexOf('{');
  var end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no-json');
  }
  var slice = text.slice(start, end + 1);
  return JSON.parse(slice);
}

// ==== 結果表示 ====
function renderResult(obj) {
  var dishes = Array.isArray(obj['料理']) ? obj['料理'] : [];
  var d1 = dishes[0] || {};
  var d2 = dishes[1] || {};

  currentEmoji = obj['絵文字'] || '';
  els.outEmoji.textContent = currentEmoji;
  els.outName.value = obj['商品名'] || '';
  els.outOrigin.value = obj['産地'] || '';
  els.outPop.value = obj['pop一言'] || obj['POP一言'] || obj['pop_一言'] || '';
  els.outDish1Name.value = d1['名前'] || d1['料理名'] || '';
  els.outDish1Desc.value = d1['説明'] || '';
  els.outDish2Name.value = d2['名前'] || d2['料理名'] || '';
  els.outDish2Desc.value = d2['説明'] || '';

  els.placeholder.hidden = true;
  els.results.hidden = false;
}

// ==== 共有テキスト生成（編集後の内容を反映） ====
function buildShareText() {
  var name = (els.outName.value || '').trim();
  var origin = (els.outOrigin.value || '').trim();
  var pop = (els.outPop.value || '').trim();
  var d1n = (els.outDish1Name.value || '').trim();
  var d1d = (els.outDish1Desc.value || '').trim();
  var d2n = (els.outDish2Name.value || '').trim();
  var d2d = (els.outDish2Desc.value || '').trim();

  var lines = [];
  lines.push((currentEmoji ? currentEmoji + ' ' : '') + name);
  if (origin) lines.push('・産地: ' + origin);
  if (pop) lines.push('・POP一言: ' + pop);

  var dishParts = [];
  if (d1n) dishParts.push('①' + d1n + (d1d ? '（' + d1d + '）' : ''));
  if (d2n) dishParts.push('②' + d2n + (d2d ? '（' + d2d + '）' : ''));
  if (dishParts.length) lines.push('・料理: ' + dishParts.join(''));

  return lines.join('\n');
}

// ==== 共有 ====
function handleShare() {
  var text = buildShareText();
  if (navigator.share) {
    navigator.share({ text: text }).catch(function () {
      // ユーザーキャンセル等は無視
    });
    return;
  }
  var url = 'https://line.me/R/share?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}

function handleCopyShare() {
  var btn = els.copyShareBtn;
  var original = btn.textContent;
  copyText(buildShareText()).then(function () {
    btn.textContent = 'コピー済み';
    setTimeout(function () {
      btn.textContent = original;
    }, 1200);
  });
}

// ==== API呼び出し ====
function callApi(apiKey, productName, imageData) {
  var content = [];

  if (imageData) {
    var base64 = imageData.indexOf(',') !== -1 ? imageData.split(',')[1] : imageData;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
    });
  }

  var instruction;
  if (imageData && productName) {
    instruction = '写真の商品でPOPを作ってください。商品名の補足: ' + productName;
  } else if (imageData) {
    instruction = '写真の商品を判別してPOPを作ってください。';
  } else {
    instruction = productName;
  }
  content.push({ type: 'text', text: instruction });

  var body = {
    model: MODEL,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: content }]
  };

  return fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });
}

// ==== メイン処理 ====
function handleGenerate() {
  clearMessage();

  var name = (els.input.value || '').trim();

  if (!currentImageData && !name) {
    showError('写真を選ぶか、商品名を入力してください');
    return;
  }
  if (name.length > MAX_NAME_LENGTH) {
    showError('商品名が長すぎます');
    return;
  }

  var apiKey = getApiKey();
  if (!apiKey) {
    showError('設定でAPIキーを入力してください。', true);
    openSettings();
    return;
  }

  setLoading(true);

  callApi(apiKey, name, currentImageData)
    .then(function (res) {
      if (!res.ok) {
        // APIのエラーメッセージ本文を読んで、原因が分かる表示にする
        return res.json().catch(function () { return null; }).then(function (errBody) {
          var apiMsg = errBody && errBody.error && errBody.error.message ? errBody.error.message : '';
          if (/credit balance is too low/i.test(apiMsg)) {
            throw { userMessage: 'API残高が不足しています。console.anthropic.com の「資金を追加」からチャージしてください' };
          }
          if (res.status === 401 || res.status === 403) {
            throw { userMessage: 'APIキーが正しくないか権限がありません' };
          }
          if (res.status === 429) {
            throw { userMessage: 'リクエストが多すぎます。少し待って再試行してください' };
          }
          throw { userMessage: 'エラーが発生しました (ステータス: ' + res.status + (apiMsg ? ' / ' + apiMsg : '') + ')' };
        });
      }
      return res.json();
    })
    .then(function (data) {
      var text = '';
      if (data && data.content && data.content[0] && typeof data.content[0].text === 'string') {
        text = data.content[0].text;
      }
      var obj;
      try {
        obj = parseModelJson(text);
      } catch (e) {
        throw { userMessage: '応答の解析に失敗しました。もう一度お試しください' };
      }
      renderResult(obj);
    })
    .catch(function (err) {
      if (err && err.userMessage) {
        showError(err.userMessage);
      } else {
        // fetch自体の失敗（ネットワーク例外）
        showError('通信に失敗しました。接続を確認してください');
      }
    })
    .then(function () {
      setLoading(false);
    });
}

// ==== コピー ====
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(function () {
      return fallbackCopy(text);
    });
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e) {
    // 失敗しても致命的ではない
  }
}

// ==== 設定モーダル ====
function refreshKeyStatus() {
  var has = !!getApiKey();
  if (has) {
    els.keyStatus.textContent = 'APIキーは保存済みです。';
    els.keyStatus.className = 'key-status set';
  } else {
    els.keyStatus.textContent = 'APIキーは未設定です。';
    els.keyStatus.className = 'key-status unset';
  }
}

function openSettings() {
  els.apiKeyInput.value = getApiKey();
  refreshKeyStatus();
  els.settingsModal.hidden = false;
}

function closeSettings() {
  els.settingsModal.hidden = true;
}

function handleSaveKey() {
  var key = (els.apiKeyInput.value || '').trim();
  setApiKey(key);
  refreshKeyStatus();
  if (key) {
    clearMessage();
  }
}

// ==== イベント登録 ====
function bindEvents() {
  els.generateBtn.addEventListener('click', handleGenerate);

  els.input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGenerate();
    }
  });

  els.photoInput.addEventListener('change', handlePhotoChange);
  els.removePhotoBtn.addEventListener('click', removePhoto);

  els.shareBtn.addEventListener('click', handleShare);
  els.copyShareBtn.addEventListener('click', handleCopyShare);

  var toggleKeyBtn = document.getElementById('toggleKeyBtn');
  if (toggleKeyBtn) {
    toggleKeyBtn.addEventListener('click', function () {
      var isHidden = els.apiKeyInput.type === 'password';
      els.apiKeyInput.type = isHidden ? 'text' : 'password';
      toggleKeyBtn.textContent = isHidden ? '隠す' : '表示';
    });
  }

  els.settingsBtn.addEventListener('click', openSettings);
  els.closeSettingsBtn.addEventListener('click', closeSettings);
  els.saveKeyBtn.addEventListener('click', handleSaveKey);

  els.settingsModal.addEventListener('click', function (e) {
    if (e.target === els.settingsModal) {
      closeSettings();
    }
  });
}

// ==== 起動 ====
function main() {
  initElements();
  bindEvents();

  if (!getApiKey()) {
    showError('設定でAPIキーを入力してください。', true);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // 登録失敗は致命的ではない
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', main);
