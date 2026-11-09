# WF-B：(A)同start wrapper・先行private cell／同bindingの検証

Date: 2026-11-10 / 基準HEAD: `74bb73c` / 未コミット差分のローカル合成検証。

対象は[probe frame接続差分設計](BEST_PRACTICE_WFB_PROBE_FRAME_ENTER_EXIT_DESIGN.md)の(A)だけ。正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実接続・実通信・設定変更・Pushなし。作業開始時の作業ツリーはクリーン。runtimeコード・設定は変更していない。

## 実装範囲

- 同RetirementStartAssembly内へ旧prepareのframe区間をprivate `frameBoundary`として抽出。旧seedなし経路のbody／catch／finally／drainと既存拒否順は維持する。新seed付きstartとprivate probe_closed経路は、同wrapperへ到達しても`#frame=true`より前に`blocked_frame_execution`で拒否する。
- 新試験factoryは同CanonicalGateDraftRootに固定追加8段階を持たせる。use・frame origin・空grant・未開始body・空exit・診断・bundleを先行構築し、旧gate／issuer／start構築後に同bindingを生成して一度bindする。旧不変slot37・非実行draft・旧factoryは維持する。
- bundleはbrand＋7field、bindingはbrand＋12field。同rootのcurrent／issued・同参照・固定field数を確認し、start側のprivate受領物も別確認する。故障時は捕捉prefix、拒否候補、元firstと借用責務を保持し、重複bindはrefusalのみ。
- 公開check／checkLegacyは拒否確認だけ。新probeのbody起動・grant発行・利用claim消費・退出記録・回収開始は0。旧回帰試験では旧合成bodyを従来通り試験するが、新probe実行やruntime接続の成功とは数えない。

## 最終実行結果

| 検証 | 結果 |
|---|---|
| 新probe-frame-preparation試験 | 65件成功（関連合計1,231−旧1,166） |
| 関連19ファイル | 1,231件成功、失敗0 |
| 新compiled-probe-frame-preparation | exit 0、cell10・binding前段15・receiver1・one-shot1・seed guard trap1 |
| 旧compiled10本 | 全てexit 0、旧wrapper／claim9対照等維持 |
| `bdo npm run build` | exit 0 |
| composition＋新試験のstrict TypeScript | exit 0 |
| 梱包dry-run | exit 0、441ファイル、試験fixture混入0 |

関連試験はprobe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundary。`bdo npx --no-install vitest run`へ各`tests/review/<name>.test.ts`を指定した。全repository回帰は未実施。

旧compiledはcanonical-gate-draft（29identity等）／canonical-supply-construction（17binding）／journal-supply-shell（11binding）／writer-gate（20identity）／absence-journal／capture-admission／retirement-start（9frame claim）／pending-binding／pending-construction／declared-actualの各`tests/review/fixtures/compiled-<name>.mjs`を`bdo node`で実行した。旧compiledの判定は緩めず、compositionの新factory追加に伴うexport一覧だけ更新した。旧互換facadeのexportは不変。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-frame-preparation.test.ts`。compiledは一時directoryで隔離compileしfinallyで除去。梱包は一時cacheで`npm pack --dry-run --json --ignore-scripts`の一覧を検査し、全tests／probe-frame-preparation／composition fixtureの混入0を確認した。archive生成・依存導入・配布worker起動なし。

## 独立oracle・compiled負の対照

8段階×before／attempt／after／doneの32prefixを本体の段階表からimportせず添字と各境界の意味から導出した。1〜7失敗では旧30段階だけ捕捉・issuer未構築、8失敗では旧37段階保持を確認する。失敗後のprepare／check／checkLegacy／closeは同じ固定返答を返し、追加cell・元参照を消さない。

cell10条件を単独で外すcompiled変異では、元のissuer前拒否から構築postへ進むことを確認した。binding15条件はstart側の重複防御で後段拒否される場合があるため、最終成功だけでなく`bindingAttempted=false→true`の変化を判定する。receiverの同cell条件を外すとstart_cells_copyが受理される対照も別に置く。mutation anchorは各一意性を確認する。

二重bind guard除去は`duplicate_binding→not_refused`で検出する。seed付き旧prepareへの迂回拒否は、wrapperのframe開始直前に固定throw sentinelを挿入した隔離compiledコピーで検証した。元guardではprobe／旧prepare経由とも拒否、seed guard除去だけでsentinelへ到達する。sentinelはbodyより前にthrowするため、負の対照でも新bodyを起動しない。wrapper呼出し2・frameExits0・bodyCalls0を併せて確認する。probe route条件はseed guardと冗長なため、現段階でその条件単独の独立効果まで実証したとはしない。

重複準備、構築中再入、開始前／後close、private受領cellのcopy、不正factory入力・Proxy・callback非実行、旧root不変も確認した。固定ゼロ診断だけで操作不在を断定せず、wrapper境界のsentinelと実呼出しcounter、経路の差分確認を組み合わせる。

## 初回失敗・修正と再実行

初回の3ファイル試験は、class static initializerでprivate継続を代入する時点より`let probeStartAccess`の宣言が後にあり、TDZのReferenceErrorで全3 suiteが読込み失敗、試験実行0だった。同時のstrict検査は宣言前参照1件と、freezeされたbrandの`true`がbooleanへ広がる型エラー2件を検出した。

既存private継続の配置と比較し、宣言をclassより前へ移し、brand literalを`true as const`へ固定した。実行権限・期限・試験条件は変えていない。再実行で局所3ファイル288件成功、strictエラー0、その後の関連19ファイル1,231件・compiled11本・build・梱包が全て成功した。初回失敗を環境制約や製品timeoutへ分類していない。

## 未対応・Unknown

attemptの一度限り消費・enter active・正常／throw／取消probe body・grant退役・退出候補・PX05・request／close実合流・回収claim・全writer停止・Journal供給・GateClosedRecord・root終端は未接続。新cellはunused／empty／not_startedだけの先行型で、診断cellの空値は成功証拠ではない。構築失敗は元rootのfailure shellが保持する。

実確保layout・実OOM・constructor未捕捉参照の全回収・unit係数・各guard／refusalの全体呼出し上界・実E／S・runtime停止はUnknown。旧37＋追加8は保持産物のscheduleで実allocation数／work料金ではない。新bodyの退出保証を確認済みにせず、次段階(B)は固定exit責務を伴う別承認で進める。

## コミット候補だけの隔離再確認

同日、HEAD＋今回の9ファイルだけを一時index／object領域でtree化し、別directoryへ展開した。検証対象treeは`d7015042a83a7fc45d167d93db61f08b6ee77194`（本節追記前）。既存node_modulesだけを参照し、依存導入なし。そのコピーでbuild・strict検査・関連19ファイル1,231件・新旧compiled11本・梱包dry-runを再実行し、全てexit 0。梱包441ファイル、fixture混入0を再確認した。

本節以外のコミット対象が検証treeと同じであることと、対象9ファイル・文書参照・差分空白をコミット前に照合する。今回の再確認でも新probe body／grant／退出記録・実接続・実通信・設定変更は未実施。全repository回帰・Pushも行っていない。
