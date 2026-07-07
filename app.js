'use strict';

// ==== 定数 ====
var API_URL = 'https://api.anthropic.com/v1/messages';
var API_KEY_STORAGE = 'anthropic_api_key';
var MODEL = 'claude-haiku-4-5';
var MAX_NAME_LENGTH = 100;

var SYSTEM_PROMPT =
  'あなたはスーパーの青果売り場のPOP作成のプロです。ユーザーが入力した商品名について、必ず以下のJSONオブジェクトだけを返してください。前後に説明文やコードフェンスを付けないこと。形式: {"特徴":"旬・産地・味・栄養など2〜3文","食べ方":"具体的な調理法や食べ方を2〜3案、読点や改行で区切る","pop一言":"店頭で目を引く20文字前後のキャッチコピー"}';

// ==== 要素参照 ====
var els = {};

function initElements() {
  els.input = document.getElementById('productInput');
  els.generateBtn = document.getElementById('generateBtn');
  els.message = document.getElementById('message');
  els.results = document.getElementById('results');
  els.placeholder = document.getElementById('placeholder');
  els.outFeature = document.getElementById('out-feature');
  els.outEat = document.getElementById('out-eat');
  els.outPop = document.getElementById('out-pop');
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
  var feature = obj['特徴'] || '';
  var eat = obj['食べ方'] || '';
  var pop = obj['pop一言'] || obj['POP一言'] || obj['pop_一言'] || '';

  els.outFeature.textContent = feature;
  els.outEat.textContent = eat;
  els.outPop.textContent = pop;

  els.placeholder.hidden = true;
  els.results.hidden = false;
}

// ==== API呼び出し ====
function callApi(apiKey, productName) {
  var body = {
    model: MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: productName }]
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

  if (!name) {
    showError('商品名を入力してください');
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

  callApi(apiKey, name)
    .then(function (res) {
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw { userMessage: 'APIキーが正しくないか権限がありません' };
        }
        if (res.status === 429) {
          throw { userMessage: 'リクエストが多すぎます。少し待って再試行してください' };
        }
        throw { userMessage: 'エラーが発生しました (ステータス: ' + res.status + ')' };
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

function handleCopyClick(e) {
  var btn = e.target.closest('.copy-btn');
  if (!btn) return;
  var target = document.getElementById(btn.getAttribute('data-target'));
  if (!target) return;
  var original = btn.textContent;
  copyText(target.textContent || '').then(function () {
    btn.textContent = 'コピー済み';
    setTimeout(function () {
      btn.textContent = original;
    }, 1200);
  });
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

  document.addEventListener('click', handleCopyClick);

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
