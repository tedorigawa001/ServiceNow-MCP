# WF-B：同construction／source／controlのprivate結合の合成検証

Date: 2026-11-09 / 基準HEAD: `2022cc3` / 対象：[回収基盤設計draft-0.4 §14](BEST_PRACTICE_WFB_PENDING_CUSTODY_RETIREMENT_DESIGN.md)。

Status: 第2段階の合成private結合のみ。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。下位claim消費・payload移動・detach・holder公開・全回収・証拠発行・root finish・C実行・実期待値pin・実source照合・実接続／実通信・実機操作・設定変更・Pushは行っていない。

## 配置と保証の区別

第1段階のunbound coreを既存`tests/review/fixtures/snapshot-read-composition-fake.ts`へ移し、旧`pending-construction-fake.ts`を同factoryの薄い再exportにした。新しい`pending-binding-fake.ts`も診断factoryだけを再exportする。同lexical境界のprivate継続は元4capture cellとscopeを直接確認し、公開summary／facadeからownerを復元しない。旧74件とparentLinks／originの独立確認を維持する。

新ownerは同RetentionRoot、SourceRootSlot、claim originを先に保持し、unbound生成→private scope→source捕捉・既存供給準備→同anchor／参照wrapper／unused claim→control／receipt→pre→bind→postへ一度だけ進む。receiptは同scope・source slot・control／core・4slot配列へpinする。boundは結合receiptの受理履歴であり、空slotのpayload装填や移譲成功ではない。通常slot／payloadは移動しない。

controlのcoreは5個のorigin関係（owner／construction／retention／source／claim）だけで、source object・anchor・元claimを別live cellに分離した。stop後のcell退役は一度だけで、identityとsource側control発行済み参照を残す。retiredは全通常gateで拒否する。旧入口はこの退役を実行せず、従来の挙動を維持する。新factoryの表面はprepare／check／close／inspectだけで、任意object／callback／summaryを採用しない。

## 独立oracleと失敗責務

新規37件：旧factory同一性1、正常1、単独混入16、cell退役1、生成／bind前後の故障・close／再入9、重複1、開始前close1、早過ぎるcheck1、alias／再退役3、hook／非昇格1、root liveのretired拒否1、有限lifecycle oracle1。

- 混入はcoreのowner／construction／retention／source／claim／余分payload field、receipt同値copyと両scope／source slot／control／core／slot配列、current anchor／payload／claimのcopyを個別に検査する。狙うfield以外を整合させる固定内部scriptだけを使う。
- prefix oracleは本体の保持表をimportせず、source生成前empty・未捕捉unknown・捕捉済みcaptured、bind前後のsourceAttached、先行理由と開始1を別表で期待する。正規SourceRootSlotだけを停止し、不正候補から別rootを取り出さない。
- lifecycle oracleはprepare／check／closeの3³=27列・各prefixについて、開始0／1・先行理由・停止・sourceの保持を別状態モデルで確認する。失敗後・close後は再生成しない。
- 正常の固定保持表はR1=3、R2=5、R3=2、R4=2、R5／R6 payload空。R7はlocal／issued／source controlのlive有無、元claim／control alias数を分け、R8は正規SourceRootSlotとcurrent／issued receiptを確認する。close／拒否後も通常参照・発行根拠・borrow／Snapshotを保持し、旧discardPassesを追加しない。
- cellを一度退役してもR1〜R4と元claim aliasは残る。余分claim aliasは3、余分control aliasは3となり、同controlなら全aliasが同live空cellを見る。この状態を全回収済みと呼ばずretirement=not_started／rootFinish=not_calledのままにする。
- retired拒否はroot自身の先行理由なし・borrow／Snapshot保持の有効基点でも検査する。先行root失敗だけで拒否できる偽の対照にしない。

sourceの元供給準備自身が失敗した場合の既存clear／診断は変更しない。新結合側の生成失敗／close／binding拒否はrootの停止だけへ送り、source.clear／fail／finishを呼ばない。sourceのconstructorが返らなかった内部状態・実OOM捕捉はUnknown。先行ownerの実確保失敗、全heap／work、実E／S、通常slot集約は今回確認していない。

## compiled・梱包保証

新compiled対照はreceipt／coreの単独検査除去8種と、重複開始・cell clear漏れ・root停止漏れ・R1の参照計数欠落・retiredを拒否しないgateの5種。元検査が拒否し、その条件を除去した変異では同対照が失敗することを確認する。core source等、source側と二重に検査する条件はunitの拒否対照だけであり、単条件除去に敏感だとは主張しない。

旧compiledはunbound16＋6変異と12prefix、sourceGrid75・旧B8・供給6・transfer24＋退役7・境界14＋値19＋件数3を維持する。composition namespaceは7factory、8本の薄い入口との同一性もcompile後に確認する。

梱包では新factory／fixture markerの混入をseeded負対照で拒否する。unbound coreの依存監査は同moduleの明示区間へ移し、旧薄い入口を固定文字列で確認する。既存composition依存監査とoffline dry-runによりruntime配布物へ登録口やfixtureが入らないことを確認する。難読化コードを網羅する安全性解析ではない。

## RED・初回失敗と修正

1. 旧factory同一性と新正常bindingの試験は実装前にfactory未配置／未定義で失敗した。旧coreを同compositionへ移し、private継続と固定生成経路を追加した。
2. 単独混入試験はselector未実装時に開始0で失敗した。固定scriptを追加し、開始1／source捕捉後の狙った拒否・参照保持を確認した。
3. 初回型検査はprivate fieldを型queryに使った構文でTS1003。外側の固定reason unionへ置き換えた。anyや検査抑制は使っていない。
4. 配置統合後、旧compiled変異の文字列anchorが新側条件にも一致して件数検査に失敗した。旧条件や変異を緩めず、新側の記述を一意に調整して旧検査を維持した。新compiled対照の最初の実行ではsource-stop文字列の空白が本体と不一致で失敗し、実際の固定行へ合わせた。

既存(B)の期待値・期限・cap・D_stop／D_end・guard上界は変更していない。全repository回帰ではなく、下記関連25ファイルの回帰である。

## 検証コマンド

```sh
bdo npm run build
bdo npx vitest run tests/review/pending-binding.test.ts tests/review/pending-construction.test.ts tests/review/supply-boundary.test.ts tests/review/canonical-supply-transfer.test.ts tests/review/canonical-supply-view.test.ts tests/review/snapshot-read-composition.test.ts tests/review/read-hash-declared-actual.test.ts tests/review/read-hash-kernel-extraction.test.ts tests/review/snapshot-read-start.test.ts tests/review/read-hash-capacity.test.ts tests/review/read-hash-fake.test.ts tests/review/read-ops-fake.test.ts tests/review/source-map-supply.test.ts tests/review/source-map-values.test.ts tests/review/carrier-coverage.test.ts tests/review/seed-bootstrap.test.ts tests/review/bridge-work.test.ts tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts
bdo node tests/review/fixtures/compiled-pending-binding.mjs
bdo node tests/review/package-http-classification.mjs
```

## 最終検証結果

| 確認 | 結果 |
|---|---|
| 新unit | 37件成功 |
| 関連回帰 | 25ファイル・1,625件成功 |
| build | npm run build成功 |
| strict型検査 | 新入口・旧入口・新test経由のnoEmit／strict／noUnused成功 |
| lint | 変更TS／MJSのESLint成功 |
| 新compiled | binding8変異・lifecycle／retention5変異を検出、薄い入口同一性成功 |
| 旧compiled | unbound16＋6変異・12prefix、既存source／transfer／boundary対照を維持 |
| 梱包 | offline dry-run441ファイル・既存／新compiled・seeded漏洩／依存負対照成功 |
| 文書 | 関連4文書のローカルMDリンク27件有効、diff --check成功 |

上記は実装時の関連回帰であり、全repository回帰ではない。コミット対象だけの再検証は末尾に記録する。

## 未実装・次工程

全8群の固定回収、未確認保持、回収claim、PayloadGoneEvidenceのprivate発行／一度限り消費、root finish→retireFailedが次工程。今回のsource結合receiptや保持計数・空pending・cell単独退役をその証拠にしない。正規SourceRootSlotを残す間にsource R1／R2／R7を全て退役する保証もまだない。下位移譲claim消費・pending記録・detach・holder公開・C実行は別工程のまま。

## コミット対象だけでの再検証（2026-11-09）

今回分の14ファイルだけを明示してstageし、index全体を一時ディレクトリへ展開した。既存node_modulesだけを参照し、展開先でbuild、関連25ファイル・1,625件、新／旧入口と新testのstrict noEmit／noUnused、変更TS／MJSのESLint、offline梱包とcompiled保証を再実行し、すべて成功した。梱包441ファイル、binding8＋lifecycle／retention5変異、旧unbound16＋6変異・12prefixと既存対照、MDリンク27件を確認した。検証後の変更は本記録の再検証追記だけとし、残りの対象ファイルが検証済み展開内容と一致することを再照合する。無関係な変更・全体回帰・実通信・C実行等は追加せず、Pushは行わない。
