# OH-01 内部型・session側handoff claim：合成検証

Date: 2026-10-26。対象：[OAuth→source移譲設計draft-0.2 §11](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#11-oh-01の限定実装と未接続範囲)。

## 1. 今回の範囲

独立した合成issuer内にsession／root／destination／ticket／leaseと、session側のrunClaimed／transportClaimed／handoff状態を実装した。既存FixtureAccountingSession／OAuth adapter／固定source／実sessionへの接続は行わず、dispatcher・reader・token・C/G/P/E/Rを登録・移動するAPIも持たない。

新しいleaseはmodelのopaque値で、正式なsource capability／receipt／実行permitではない。正式発行口・全体受付は閉鎖／無効、Unknownを維持。VM／監視／telemetryは保留。実HTTP／実機操作・credential／token発行・設定変更は対象外。

## 2. 実装と検査

- 同sessionの生成claimを構成検査前に消費し、失敗後の再生成を拒否。transport claimも同model sessionに一つだけ置く。
- root／destination／ticket／leaseは凍結opaque handleとrealm固有WeakMapで認識。同値のIDやcloneで代用しない。
- 合成OAuth readyとadapter-finally完了を区別。idle・normal phase・既知ready／adapter／budget／dispatcher identityが揃った場合だけofferする。
- adoptは同rootのticketとsession claimを先にconsumingへ進め、destination／generation／identity・最終時計を確認後にmodel leaseを一度生成。失敗後の修正・別destinationへの移し替えは拒否する。
- 消費済みticket／stale bootstrap操作で成功済みleaseを停止しない。一方、root取消・session失効はleaseを止める。最初のprimaryとclosed終端を維持する。
- 未知の失効理由・例外は固定codeへ変換し、生文字列や秘密を診断へ保存しない。

## 3. 合成41ケース

`tests/review/abort-scope-evidence-handoff-model.test.ts`。

| 観点 | 確認 |
|---|---|
| 一意性／入口 | 同session二重生成、構成検査失敗後の修正、per-user、実session object・scalar copyの拒否 |
| ready／後始末 | readyだけではoffer不可、未完了OAuth、final phase、active I/O／pending body／timer／scratch／他用途／cleanup未確認の拒否 |
| identity | auth／adapter／budget／dispatcher／readyの差替えを、offer前・offer後の双方で拒否 |
| 消費／所有権 | clone／別realm ticket、foreign destination、失敗後再使用、二重adopt／offer、stale bootstrap close／callbackを拒否。元runや成功済みleaseの不当な停止なし |
| root失効 | source_owned後のcancel／close／session revokeがleaseを失効し、再生成を拒否 |
| 診断 | 認証拒否／上流障害のprimary保持、未知reasonの秘密非出力、closed後cancelでもclosed維持 |
| 時間／競合 | 60秒・短縮120msのnormal／hard等号、最終checkpointでのphase超過、再入cancel／ready変更、逆行／例外を拒否 |
| 制御費／閉鎖 | offer／adoptは通常各2回のclock呼出し。I/O／activation入口なし、opaque handleのJSONは空object。実work上界の証明ではない |

時計とidentity変更はfixture用の合成入力である。実際の認証／解放／経過時間を証明せず、既存HTTP・payloadの会計oracleも置き換えない。原設計のC=7/8、G/E/R一致、OAuth→固定source→worker連続試験はOH-03へ残す。

## 4. 検証履歴

初回39ケース中1件が失敗。別realmの健全性確認に、そのrealmを所有しないissuerのstatusを使っていたことを確認し、試験側の参照だけを修正した。実装のrealm拒否を弱めず、39件成功を確認。

次に、消費済みfailed ticketの返却理由、未知revocation文字列の非露出、closed状態の維持を期待値にしたテストを先に追加した。前二つで2件失敗、最後で1件失敗を確認後、一次理由の検査順・失効理由のruntime allowlist・closed状態保持をそれぞれ修正した。最終モデル41件は成功。skip／期限延長で回避していない。

最終確認：

- `bdo npm run build`：成功。
- model単体：41/41成功。
- `bdo npm test`：最終158ファイル／4,618件成功。PDI E2Eは含まない。
- ESLint APIでsrc／tests全体：0 errors、既存374 warnings。
- offline `tests/review/package-worker.mjs`：377ファイル、production-only install／worker解析・集約／MCP／fixture境界smoke成功。新modelを含む`dist/review/abort-scope-evidence*`非同梱を確認。
- 更新4文書の相対参照25件：欠落なし。`bdo git -c core.fsmonitor=false diff --check`：空白エラーなし。

### 4.1 コミット前の再確認（2026-10-27）

- 既定並列の全体再実行は4,615件成功／3件timeout。対象はstdio-review、trusted-config-file、r2-approval-manifestで、3ファイルを`--maxWorkers=1`で再実行すると71件すべて成功した。元のtimeoutの原因は確定していない。
- 制限付き環境での並列数3の再実行では、ローカルHTTP試験に`listen EPERM 127.0.0.1`を確認した。これは元の3件のtimeoutとは別の確認事項であり、この再実行は中断した。
- ローカル待受を許可して`bdo proxy node node_modules/vitest/vitest.mjs run --maxWorkers=3`を再実行：158ファイル／4,618件すべて成功（47.45秒）。製品・テストの期限、テストコード、設定は変更していない。PDIへの接続は行っていない。
- build成功、ESLint 0 errors／既存374 warnings、offline梱包検証377ファイル成功、更新4文書の相対参照25件に欠落なしを再確認した。

## 5. 次の実装単位

OH-02の固定dispatcher・既存Web Streams adapterの所有者切替が次段。OH-01 model leaseをcastして実adapterや既存固定sourceへ接続しない。OH-03でprivate採用入口、同一の会計／時計、初回／最終・worker・終了処理を結合する。

正式なauth snapshot／ReleasePermit／選択payload／worker job binding、本番token管理・公開BR-006契約・cap承認・全体work／保持／終了保証・実機検証は未接続／未確認のまま。
