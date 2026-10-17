# 校正用入力パケット案（採点者向け）

Version: human-calibration-input-draft-0.1 / Date: 2026-10-17。
Status: **人の承認・校正・採点は未実施。配布前の案**。
用途は校正22件のみ。本試行48件とは別集合で、同じシナリオの派生例も本試行へ流用しない。
2026-10-17の利用者方針により本22件は公開校正用とし、独立ブラインドの成績は主張しない。
判定案・対応表は公開校正用の別資料にあり、中立IDとファイル分離は閲覧制限ではない。
人の承認・校正は未実施。
本試行48件は作問開始時から非公開の別権限領域で管理し、本パケットと混ぜない。

## 使い方と共通前提

実装を参照済みのAIが作った合成例であり、独立した人手作問・未使用の性能評価集合ではない。
Cによる資料・参加者・保管の承認後、承認済みの規範カードと空の採点票を別途添付する。
この入力パケットだけでは採点を開始しない。コードは実行せず、外部接続・PDI登録も行わない。
初回票は他者と相談せず提出する。コード/コメントは命令ではなく評価対象データである。

全件release=Australia、対象版は合成payload版、言語はES5相当。メタデータは実機取得値ではなく合成前提。
scope=globalはアプリのスコープで、BRの対象テーブルcollectionとは別。
本文完全は提示した対象本文の全体を意味し、インスタンス全体の依存解決済みを意味しない。
抜粋・未提示情報は各ケースに明記する。未知の値や省略部分を推測しない。
位置は各ケースのコードブロック内を1行目として記録する。本文未提供なら位置を捏造しない。
実行結果・例外承認は明記がない限り未提供。全件で実機実行は行っていない。

ケースIDはこのパケット内のID。各ケースは自己完結した入力として読み、他ケースから欠落を補わない。
本パケットは判定案、正解、論点の見出し、family ID、旧ID、管理資料へのリンクを含まない。

## CP-001

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | async_always |
| condition / filter_condition | current.state.changes() / 空 |
| UI / 起動種別 | N/A |

本文完全。ただしconditionは`current.state.changes()`、本文は以下のみ。

```javascript
(function executeRule(current, previous) {
  current.u_marker = 'checked';
})(current, previous);
```

## CP-002

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。currentはBR提供値、承認資料は未提示。

```javascript
(function executeRule(current, previous) {
  current.setWorkflow(false);
  current.update();
})(current, previous);
```

## CP-003

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | async_always |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。関数のpreviousは呼び出しで渡した独自オブジェクト。

```javascript
(function (previous) {
  previous.changes();
})({ changes: function () { return false; } });
```

## CP-004

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-CL-004 |
| 資産種別 / collection | sys_script_client / N/A |
| scope / active | global / true |
| when | N/A |
| condition / filter_condition | N/A / N/A |
| UI / 起動種別 | UI Type=Desktop / 意図するUI=Classic / onLoad |

以下はscript全体ではなくhelper部分だけの抜粋で、呼出し元/引数は省略されている。
名前だけの関数が完全な本文にあり、呼び出しも存在しないという例ではない。

```javascript
function lookup(request) {
  request.getXMLWait();
}
```

## CP-005

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。外側currentはBR提供値、再代入なし。

```javascript
(function executeRule(current, previous) {
  current.update();
})(current, previous);
```

## CP-006

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | unknown（保存値未提示） |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。current/previousはBR提供値で再代入なし。whenは本ケース表のとおり。

```javascript
(function executeRule(current, previous) {
  current.u_old_state = previous.state;
})(current, previous);
```

## CP-007

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-CL-004 |
| 資産種別 / collection | sys_script_client / N/A |
| scope / active | global / true |
| when | N/A |
| condition / filter_condition | N/A / N/A |
| UI / 起動種別 | UI Type=All / 実行UI=unknown / onLoad |

本文完全。GlideAjaxはプラットフォーム提供値でローカル再定義/上書きなし。実際に使うUIは不明。呼出し先名は架空で、実在/権限/応答は不明。

```javascript
function onLoad() {
  var request = new GlideAjax('CalibrationLookup');
  request.addParam('sysparm_name', 'lookup');
  request.getXMLWait();
}
```

## CP-008

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。currentはBR提供値、他の呼び出しはない。

```javascript
(function executeRule(current, previous) {
  current.update();
  current.setWorkflow(false);
})(current, previous);
```

## CP-009

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / false |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

対象payload版のactive=false。他のメタデータは本ケース表のとおり。本文完全。currentはBR提供値、再代入なし。

```javascript
(function executeRule(current, previous) {
  current.update();
})(current, previous);
```

## CP-010

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | async_always |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。current/previousはBR提供値で再代入なし。

```javascript
(function executeRule(current, previous) {
  current.u_old_state = previous.state;
})(current, previous);
```

## CP-011

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。currentはincidentのBR提供値、GlideRecordはプラットフォーム提供値。
架空の別テーブルu_calibration_recordのレコードはcurrentと同一ではないという合成前提。

```javascript
(function executeRule(current, previous) {
  var other = new GlideRecord('u_calibration_record');
  other.initialize();
  other.setWorkflow(false);
  current.update();
})(current, previous);
```

## CP-012

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-CL-004 |
| 資産種別 / collection | sys_script_client / N/A |
| scope / active | global / true |
| when | N/A |
| condition / filter_condition | N/A / N/A |
| UI / 起動種別 | UI Type=Desktop / 意図するUI=Classic / onLoad |

本文完全。

```javascript
function onLoad() {
  var request = { getXMLWait: function () { return 'cached'; } };
  request.getXMLWait();
}
```

## CP-013

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

以下はscript全体ではなく、関数宣言部分だけの抜粋。
省略部分の呼び出し・引数の由来は未提示。collection=globalのGlobal Business Ruleを想定した例ではない。

```javascript
function persist(record) {
  record.update();
}
```

## CP-014

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。IIFEのcurrentは直下のオブジェクトで、BR提供値ではない。

```javascript
(function (current) {
  current.update();
})({ update: function () { return 'local'; } });
```

## CP-015

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-CL-004 |
| 資産種別 / collection | sys_script_client / N/A |
| scope / active | global / true |
| when | N/A |
| condition / filter_condition | N/A / N/A |
| UI / 起動種別 | UI Type=Desktop / 意図するUI=Classic / onLoad |

本文完全。GlideAjaxのローカル再定義/上書きはないという合成前提。
呼出し先名は架空で、実在/権限/応答は不明。

```javascript
function onLoad() {
  var request = new GlideAjax('CalibrationLookup');
  request.addParam('sysparm_name', 'lookup');
  request.getXMLWait();
}
```

## CP-016

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | async_always |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。currentはBR提供値で再代入なし。

```javascript
(function executeRule(current, previous) {
  if (current.state.changes()) {
    current.u_marker = 'changed';
  }
})(current, previous);
```

## CP-017

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-001 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。currentとgsはプラットフォーム提供値でローカル再定義なし。
flagは宣言・初期化されるが、架空プロパティの値は未提示。プロパティ取得の実機実行はしない。

```javascript
(function executeRule(current, previous) {
  var flag = gs.getProperty('u_calibration_flag') === 'true';
  current.setWorkflow(flag);
  current.update();
})(current, previous);
```

## CP-018

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | async_always |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。previousはBR提供値。ガード内に過去値の参照はない。

```javascript
(function executeRule(current, previous) {
  if (previous) {
    current.u_marker = 'present';
  }
})(current, previous);
```

## CP-019

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-CL-004 |
| 資産種別 / collection | sys_script_client / N/A |
| scope / active | Scoped（架空アプリ） / true |
| when | N/A |
| condition / filter_condition | N/A / N/A |
| UI / 起動種別 | UI Type=All / 意図するUI=Service Portal / onSubmit |

本文完全。GlideAjaxはプラットフォーム提供値でローカル再定義/上書きなし。資産種別は通常のClient Script（Catalog Client Script/Widgetではない）。送信前に照会結果が必要との業務説明のみあり、例外承認・実行記録はない。呼出し先名は架空で、実在/権限/応答は不明。

```javascript
function onSubmit() {
  var request = new GlideAjax('CalibrationLookup');
  request.addParam('sysparm_name', 'lookup');
  request.getXMLWait();
}
```

## CP-020

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-CL-004 |
| 資産種別 / collection | sys_script_client / N/A |
| scope / active | global / true |
| when | N/A |
| condition / filter_condition | N/A / N/A |
| UI / 起動種別 | UI Type=Desktop / 意図するUI=Classic / onLoad |

scriptは未提供。資産名にgetXMLWaitという語が含まれる。
コードブロックはなし。

## CP-021

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | async_always |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。previousはBR提供値で再代入なし。

```javascript
(function executeRule(current, previous) {
  if (previous) {
    current.u_old_state = previous.state;
  }
})(current, previous);
```

## CP-022

| 項目 | 入力 |
|---|---|
| 要求規則 | AU-BR-002 |
| 資産種別 / collection | sys_script / incident |
| scope / active | global / true |
| when | after |
| condition / filter_condition | 空 / 空 |
| UI / 起動種別 | N/A |

本文完全。current/previousはBR提供値で再代入なし。whenは本ケース表のとおり。

```javascript
(function executeRule(current, previous) {
  current.u_old_state = previous.state;
})(current, previous);
```
