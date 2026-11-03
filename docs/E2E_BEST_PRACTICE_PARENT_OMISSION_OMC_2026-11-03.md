# OM-C reviewed列限定・親決定owner 合成検証記録

Date: 2026-11-03 / 基準HEAD: `747084e`。

## 1 範囲と制限

[CG-C設計§12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OMISSION_CGC_DESIGN.md)のfresh合成ownerを、既存CG-Bと同じ配布除外moduleのprivate kernelへ接続した。旧factory／試験を維持し、新constructorだけに別brandの入力／wire／capture／decision／cleanup sinkを返す。runtimeソースは変更していない。

初回subsetは**reviewed列だけ**。初期prefixはstrictな合成DATA pin、finding数は同constructorの元capture列から導出する。nonreviewed／元omitted／retainedの実origin、NR-Cの既存accepted／plan、OM-B計数器やfinalize／finish jobには接続しない。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持した。

- deliver／acceptは既存CG-Bと同じprivate入力・元JSON・context・post guard受理を再利用する。旧capture handle・pure DATA・summaryを登録／昇格しない。
- 次行のcapture受理前に前行の決定を要求し、keep／omit共通のclaimをpre guard前に占有する。同元capture参照・slot・ordinalとOM-A traceを照合し、post guard後だけ空の別brand決定を発行する。局所不一致よりpost停止を優先する。
- 元private本文はkeep／omitのどちらでも残す。モデルが返す再正規化値を元証拠へ付替えず、外部body getterも作らない。初期prefix pinは実prefix originの証明ではない。
- 消費はdiscardDecisionの一度限りの固定終端だけ。同owner handleを取り外し、全決定・capture／wire／履歴／prefixを外す。同accepted／planへの移譲口は未実装。
- source close／cleanup開始・停止・discardで同期失効。合成cleanup sinkは失敗後も1回だけ診断を更新でき、confirmedから決定を復活させない。実native cleanup証拠ではない。
- summaryはscalar・固定state／reason／scopeだけ。本文・ID・T_i・trace／handleは出さず、初回hardと累積countを残す。物理的なheap消去は保証しない。

## 2 RED／GREEN・初回失敗

1. 新factoryが存在しない失敗をREDにし、同captureから99／2のkeep／omit決定を発行する最小経路をGREENにした。
2. 未存在discardDecisionのREDを確認し、同決定の一度限り消費・全ownerの固定discardへ接続した。
3. 未存在beginCleanupのREDを確認してから、同期失効と同sinkのdiagnostic-only終端を接続した。
4. 拡張52件の初回は49成功・3失敗。2件は`it.each([[],['response_truncated']])`が配列を引数展開したため、prefixへ配列ではなくundefined／stringを渡していた。対応するstrict型検査も3エラーになった。明示的なobjectケースへ訂正し、型・runtimeの双方を再確認した。残る1件は`findings`の部分文字列禁止が件数名kept_findingsにも一致した試験の誤りで、本文fieldのquoted keyとの照合へ訂正した。実装の許可条件は緩めていない。

実装での局所binding不一致をpre/postの間に保持する経路も追加し、foreign／duplicate／余分引数に対するpost期限停止の優先を検査した。constructor seed／guardの後書換えは反映させない。

## 3 最終検証

| 検証 | 結果 |
| --- | --- |
| 新OM-C | 59件成功 |
| OM-C／OM-A／CG-B／CG-BP1／NR-C関連 | 5ファイル・324件成功 |
| 全体回帰 | 266ファイル・13,003件成功、失敗0・pending 0 |
| build | 成功 |
| 新owner・既存capture／binding／mixed試験のstrict型検査 | 成功 |
| 変更TS・梱包試験のESLint | 問題なし |
| 梱包 | 441ファイル。新factory・owner scope／brand／型が非同梱、固定pure import監査・seeded漏出／runtime／I/O／clock／workerの負の対照成功 |

全体回帰はmaxWorkers=3、既存localhost合成待受を許可した条件で実施。期限の延長はなく、実PDI・外部サービスは利用していない。新owner自身は実worker／transport・時計・timerを起動しない。

### 3.1 主な対照

- 明示finding表（99＋1、100＋0、99＋2＋1、50＋51＋50、100＋1＋1）を独立期待値とし、全結果単位だけのomitと、超過後に収まる行のkeepを確認した。100行のゼロfinding・100決定、101行拒否も検査した。
- capture／copy／wire／input／decision／summaryの混入、旧factoryのcapture、新handleのnominal型違い、二重決定・消費・次captureの受理順違いを拒否。別ownerの状態は変更されないことも確認した。
- 受理pre/postと決定pre/postの全4点で取消／期限・6種類の再入、post停止とbinding／duplicate／余分引数の優先、未知停止とraw throwの固定写像を検査した。例外をcallerが捕捉してもpending 0・元本文参照0のまま。
- 決定後のsource開始／cleanup開始／discard／stopによる同期失効とcount保持、late cleanup、未開始／別sink／未知status／二重開始・終端を検査した。先行hardを後のbinding失敗で置換しない。
- initial response_truncatedの有無とerrors=100、prefix／context／guardの後書換え、strict top-level・model／version／context差・非reviewed／不正JSONを検査。getter／Proxy callbackは0回、raw exception／本文／IDをsummaryへ出さないことを確認した。

## 4 費目と残課題

入力／wire／capture／決定／履歴は各100以下だが、k行目のOM-A全履歴再計算はk asset分のcopy／schema／serialize／freezeを行う。最大100行なら5050 asset分のpure計算で、元private本文と一時正規化graphの保持費は別。guard4点／行・Map／handle／prefix／trace・clearも追加費目であり、総work／memoryと同期中断粒度はUnknown。全60秒・210試行・C/G/P／retryを更新していないが、その期限保証を新owner単体で得たとも主張しない。

次は非reviewed／元omitted／retainedの保護された供給と混合、同accepted／planへ一度移すOM-D契約が残る。OM-Bのbounded計数・固定Eのfinalizeも別途未実装。実session／ReleasePermit／worker jobへの正式binding・実cleanup・full内容gate・候補・全体work受付も未接続である。

正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持し、実接続・実通信・実機操作・設定変更・Permit／候補発行・Push・本作業のコミットは行っていない。
