# WF-B：回収owner／claim・固定診断・frame境界の合成検証

Date: 2026-11-09 / 基準HEAD: `ab377c1` / 対象：[固定回収schedule draft-0.3 §11](BEST_PRACTICE_WFB_FIXED_RETIREMENT_SCHEDULE_DESIGN.md)。

Status: 合成依存の開始境界だけ。正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。field clear・capture・final audit・証拠・root終端を接続せず、実予算更新・実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 実装範囲・所有権

同composition内のprivate RetirementStartAssembly／RetirementStartClaimと固定診断を追加し、薄い`retirement-start-fake.ts`は`createRetirementStartFake`だけを再exportする。先行owner token・30field／8groupの診断はsource生成前に存在する。同PendingSourceBindingのconstruction／retentionとSourceRootSlot originをprivate継続からpinし、同owner・正規pin／claimの同参照・未消費を確認して開始する。実source・実sessionを受領する入口、公開summaryからの昇格口、任意hook／callbackはない。

公開面はprepare／request／close／inspectの固定診断だけ。compositionのexportは8factory、薄い互換入口は9本になる。既存factoryの操作・期待値・期限を変更せず、unbound74件・binding46件を維持する。PendingRetentionRootから生成前originを得る継続はprivateで、旧unbound factory自体はsourceを生成しない。

回収開始のrequestは同正規controlの通常利用gateを停止する。通常requestだけではroot close／finishを実施せず、S00全体の完了を主張しない。close／生成失敗の伝播は既存PendingSourceBindingの経路を再利用する。rootの理由写像・source自身の供給失敗の優先順を維持する。

## frame・one-shot・診断

prepareはprivate generationFrameをwrapperのactive区間へ閉じる。既存binding.prepareが返すのは固定replyだけであり、生成中のsource／anchor等を外側へ返さない。fixed scriptのrequest／close／準備失敗／catchはframe内ではdeferred_frameを返し、claim unused・starts0。finallyでframeを退出した後だけdrainし、claimを一度消費してattempt=running、blocked_field_clearで止まる。回収後の完了状態ではなく、次工程が閉じている開始境界である。

frame_exit_failureは固定の未確認故障で、frame=unconfirmed、retirementFirst=frame_unconfirmed、claim unused・開始0。prepareも成功を返さず、後続のprepare／requestでinactiveへ補完しない。これはengineの全stack探索や実OOM保証ではなく、保守的な生成wrapper境界の合成保証である。

running後のrequest／同期再入はin_progress、prepareの同期再入はpreparation_in_progress。追加frameや第2開始を作らない。所有権不正はclaim0でbinding_rejectedを固定し、反復request／closeは同じ拒否objectを返す。先行firstReasonとretirementFirstは分離し、生成失敗・入力拒否を後着closeで上書きしない。raw例外はcatchで保持せず、固定理由へ写す。

30fieldはnot_observed・writeAttempted=false・emptyConfirmed=false、8groupはunverifiedの固定配列のまま。R1〜R4と元claim／control live等の責務を保持する。sourceCaptureのempty／captured／unknownを記録するが、unknownでも局所claimの開始だけであり、本文回収やroot操作を許可した意味ではない。fieldWrites=0、payload=not_started、proofIssuance=closed、rootFinish=not_called、resourceCleanup=not_startedを維持する。下位移譲claim消費は0で、回収claimのspentと区別する。

## 合成試験・独立oracle

新規20件：正常開始1、frame内遅延1、生成失敗2、close／prepare再入／request再入1、所有混入8、frame終了未確認1、source拒否／未捕捉2、入力hook拒否1、固定診断／秘密非出力1、有限oracle1、先行入力診断／早期close1。

所有混入はowner copy、pin copy、construction／retention／source slot token、claim copy／owner／pinを固定scriptで個別に置換する。pin copy対照はclaim側pinもそのcopyへ合わせ、正規発行pinの同一性だけを欠いた有効な単独対照とする。不正候補からsourceを取り出して停止せず、同private bindingだけを停止する。

独立oracleはprepare／request／closeの3³=27操作列・各prefixについて、準備済み／回収要求／先行理由／開始0または1を別モデルで計算する。本体のclaim／checker／保持表を期待値にimportしない。source準備済みではR1=3・R2=5・R3=2・R4=2、元discardPasses=0、borrow／Snapshot保持を確認する。source自身の供給失敗の既存discard履歴は別prefixとして維持し、新回収によるclear成功へ転用しない。

## compiled・梱包対照

scratch ESMで薄い入口と同factoryの同一性を確認し、frame defer、finallyのlease退出、退出後drain、正規pin identity、先行理由保持、finally後の未確認拒否の6変異を検出する。旧compiledのsourceGrid75と既存対照、unbound16＋6変異／12prefix、binding9＋5変異を維持する。

claimのspent guardとrunning gateは二重防御であり、全内部条件がそれぞれ単独除去に敏感だとは主張しない。one-shotの外部挙動は同期再入と有限操作列で確認する。本段階にはfield clear／証拠／root完了のcompiled保証はない。

梱包監査へ新factory／fixtureの漏洩markerとcompiled入口を追加する。固定依存監査・seeded漏洩負対照によりruntime配布物へfixture／登録口を含めない。実source内容hash照合や正式な実装coverageの証拠にはしない。

## RED・初回失敗

1. 最初の正常試験は新factory未実装で失敗し、同ownerの開始経路を追加して成功。
2. frame内遅延試験はdeferred／finally後drainがなく失敗。生成wrapperとprivate generationFrameへ分けて成功。
3. 生成失敗・close／再入の追加3件、所有混入・未知frame・source prefix・入力の追加12件は対応script未実装で失敗。fixed scriptとprivate bindingを接続して成功。
4. frame終了未確認時のprepare返答がpreparedのままだった。返答を拒否する追加assertionが失敗し、finally後のframe_unconfirmed確認を追加して成功。
5. compiledの最初のownership変異はpin identityを外してもclaim.pinとの別条件がcopyを拒否し、生存した。対照側のclaim pinをcopyへ合わせ、狙ったidentity条件だけを欠くよう修正して検出した。元first保持の変異も、binding自身が元理由を保持する生成失敗対照では冗長なので、上位入力拒否→closeの有効基点へ切り替えた。
6. 最初の梱包実行はframe未確認guardの追加でcompiled文字列anchor件数が4となり、期待3に対して失敗。検査を緩めず、finally後の確認とdrainを含む一意のanchorへ修正した。
7. frame終了未確認のprepare拒否直後を確認するassertionで1件失敗した。次の外部requestまでcontrol gateがunusedだったため、finally後の未確認検出時にもrequestの停止だけを同期実行し、claim未消費・開始0を維持するよう修正した。root終端やfield clearは追加しない。

## 検証コマンド・結果

```sh
bdo npm run build
bdo npx vitest run tests/review/retirement-start.test.ts tests/review/pending-binding.test.ts tests/review/pending-construction.test.ts tests/review/supply-boundary.test.ts tests/review/canonical-supply-transfer.test.ts tests/review/canonical-supply-view.test.ts tests/review/snapshot-read-composition.test.ts tests/review/read-hash-declared-actual.test.ts tests/review/read-hash-kernel-extraction.test.ts tests/review/snapshot-read-start.test.ts tests/review/read-hash-capacity.test.ts tests/review/read-hash-fake.test.ts tests/review/read-ops-fake.test.ts tests/review/source-map-supply.test.ts tests/review/source-map-values.test.ts tests/review/carrier-coverage.test.ts tests/review/seed-bootstrap.test.ts tests/review/bridge-work.test.ts tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts
bdo node tests/review/fixtures/compiled-retirement-start.mjs
bdo node tests/review/package-http-classification.mjs
```

| 確認 | 最終結果 |
|---|---|
| 新unit | 20件成功 |
| 関連回帰 | 26ファイル・1,654件成功 |
| build | npm run build成功 |
| strict型検査 | 新入口／testのstrict noEmit／noUnused成功 |
| lint | 変更TS／MJSのESLint成功 |
| compiled | 新6変異・薄い入口同一性、旧unbound16＋6・binding9＋5・既存対照成功 |
| 梱包 | offline dry-run441ファイル、依存監査・seeded漏洩負対照成功 |
| 文書／差分 | 関連3文書のローカルMDリンク13件とfence確認、diff --check成功 |

上記は実装時の関連26ファイル回帰であり、全repository回帰ではない。コミット対象だけの再検証は末尾に記録する。

## 次工程・未確認

次はcapture25cell・停止前提・field別clear／空確認・失敗prefixの未確認保持。TrustedControlPinによるclear権限、全8群final audit、PayloadGoneEvidenceとroot終端は未接続。本claimの開始1・診断配列・空pending・停止controlをそれらの証拠にしない。全CPU／heap／layout・実E／S・実確保故障・診断必着はUnknown。既存cap・期限・D_stop／D_end・guard上界は変更しない。未コミット、Pushなし。

## コミット対象だけでの再検証（2026-11-09）

今回分の11ファイルだけを明示してstageし、index全体を一時ディレクトリへ展開した。既存node_modulesだけを参照し、展開先でbuild、関連26ファイル・1,654件、新入口／testのstrict noEmit／noUnused、変更TS／MJSのESLint、offline梱包とcompiled保証を再実行し、すべて成功した。新6変異、旧unbound16＋6・binding9＋5・既存対照、薄い入口9本の同一性、梱包441ファイル・seeded負対照、文書リンク13件を確認した。検証後の変更は本記録の再検証追記だけとし、その他の対象が検証済み展開内容と一致することを再照合する。無関係な変更やfield clear・証拠・root終端・実接続等は追加せず、Pushは行わない。
