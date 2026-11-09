# WF-B：停止確認・同ownerの内部capture admission発行の合成検証

Date: 2026-11-09 / 実装基準HEAD: `2e1ab6a` / 途中反映の設計レビュー`948f19a`も照合 / 対象：[capture受付設計draft-0.3 §10](BEST_PRACTICE_WFB_CAPTURE_ADMISSION_DESIGN.md)。

Status: 合成依存の内部issuerだけ。正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。capture・field clear・PayloadGoneEvidence・root終端・実期待値pin・実source照合・S発行・実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 実装境界・所有権

同compositionへRootStopAck／TrustedControlPin／CaptureAdmissionとPreparedClearAuthorityDraftをprivate型として追加した。CaptureAdmissionAssemblyは同RetirementStartAssemblyを内部所有し、owner／construction／retention／source slot／開始claim originをprivate継続で結合する。公開summary／外部objectを採用せず、facadeはprepare／admit／close／inspectの固定診断だけ。薄い入口は同factoryの再exportで、compositionは9factory・互換入口10本。既存factory／試験・期限は維持する。

admitは既存開始claimの予約を再利用し、同scope確認→正規root seal→Ack→control pin→admission→非実行draftの固定順で進む。root／controlにはlive参照とは独立した空originを持たせた。Ack／pin／admissionの値はtoken-onlyで、root／source class instance、anchor・元claim・本文を含めない。発行slotの同参照と、独立に得た期待scope・epoch・origin・variant・必要field／余剰fieldを確認する。

通常回収のretirementSealed flagはrootのcontext／open／begin／prepare／checkを拒否するだけで、closeRequested・元first・supplyState・borrow／Snapshotを変更しない。正規closeと生成失敗は既存の理由写像を維持する。rootの通常gate拒否とroot finish・実resource cleanup成功を混同しない。

control mintはnot_started／attempting／mintedと発行originを記録する。未捕捉はunknown責務で、not_mintedへ補完しない。source unknown／frame未確認／control mint未確認からAckやadmissionを発行しない。source既知未生成はroot_not_created・not_minted・local_onlyで発行し、root sealは0。known-absence checkpointも照合する。25cellのAbsenceJournal（preparation_completed／alias_never_assigned／legacy_discard_executed）はまだ実装していない。

正常発行後の二重admitはalready_issued、同期再入はin_progress。途中失敗ではphase・最初のadmission理由・部分生成slotを保持し、以後のprepare／admit／closeは同じ固定失敗objectを返して再試行しない。発行counterは検査完了後だけ増えるため、候補がslotへ捕捉済みでも未確認なら0である。sealAttemptsは実helper呼出し前の固定故障を含む論理試行数。

## 合成試験と独立oracle

新規52件：通常発行1、close分離／再発行拒否1、local-only1、root全通常gate1、scope／Ack／pin／admissionの混入29、途中故障prefix9、source／frame未確認2、入力hook／停止1、control mint未確認1、absence checkpoint2、同期再入1、元source理由保持2、有限oracle1。

混入29件はscopeの5field、Ack8、pin7、admission9。狙うfield以外を整合させ、candidateとissued slotが同じobjectでも各fieldを独立期待値で拒否する。同値copyは正規issued objectだけを別に保持し、同参照条件を狙う。checkpointの2件はsource未生成の有効基点で実施する。

途中故障oracleはseal前後・Ack前後・pin前後・admission前後・authority生成前の9箇所について、正常に確認・発行済みのprefixを別表で指定する。元sourceのR1=3／R2=5／R3=2／R4=2・borrow／Snapshotを保持し、失敗後の反復admit／closeで診断・試行数・保持状態が変わらないことを確認する。元source自身の供給失敗による旧discardは先行履歴として保持し、新回収による追加clearは0である。

独立lifecycle oracleはprepare／admit／closeの3³=27列・各prefixについて、準備・要求・発行0／1とfirstを別モデルで計算する。本体のchecker／pin builder／scope表を期待値にimportしない。通常回収と実close、source_rejectedとgeneration_unavailableを別に検査する。型・origin・内部値は公開せず、proxy／function等の入力hookも実行しない。raw固定例外をJSON診断へ出さない。

## compiled・梱包保証

scratch ESMで薄い入口の同一性、binding19条件とroot通常gate5箇所の変異を確認する。binding対照はscope5、Ack7、pin3、admission4。各条件を除いたとき、狙った検査段階のcounterが0→1へ進むことを確認する。Ack origin除去は後段admissionの結合でも拒否されるため、全変異が最終発行まで成功するとは主張しない。後段の二重防御と各段階の感度を区別する。

root gate対照はcontext／open／check／begin／prepareを個別に除去する。通常の有効基点でrootに先行失敗・close理由がない状態を使い、他の理由による拒否で検査が代替されないようにする。旧compiledのsourceGrid75、既存B／supply／transfer／boundary対照、unbound16＋6、binding9＋5、start9を維持する。全内部条件が単独変異で非等価とは主張しない。

梱包監査へ新factory／fixture markerとcompiled入口を追加し、runtimeへの混入をseeded負対照で拒否する。offline dry-runと固定依存監査だけで、実source内容hash照合・正式coverage・全CPU／heap費の証拠へ転用しない。

## RED・初回失敗と修正

1. 正常トレーサーは新factory未実装で失敗。最小の同owner seal／発行経路を追加して成功。
2. root gate probeが未実装で追加試験1件失敗。正規rootへの非I/O固定probeを追加した。
3. 混入・prefix・unknownの追加40件がselector／確認条件未実装で失敗。strict値確認と固定故障scriptを段階的に追加した。
4. prefixのack_after／pin_after／admission_afterが混入probeの同prefix判定に巻き込まれ、余剰fieldとして拒否されて3件失敗。probe対象fieldを固定列挙し、生成後故障と混入を分離して成功。
5. 入力拒否時のcontrol停止・control mint未確認・absence checkpointは未実装で失敗。正規停止継続、mint journalとstrict checkpoint対照を追加した。
6. 同期再入のselector未実装で1件失敗。issuing状態でin_progressを返し、二度目のissuerを開始しない対照を追加した。
7. 最初のcompiledでack_originのguardを除いても後段が拒否し、最終okを期待する試験が失敗。元の二重防御を緩めず、当該段階counterの進捗で条件感度を確認するよう修正した。
8. 作業中に設計レビュー`948f19a`が反映されたため、AbsenceJournalとcapture中closeのpost条件を再照合した。capture未接続の今回範囲を拡張せず、同レビュー文書を保持して実装説明を追記した。

## 検証コマンド

```sh
bdo npm run build
bdo npx vitest run tests/review/capture-admission.test.ts tests/review/retirement-start.test.ts tests/review/pending-binding.test.ts tests/review/pending-construction.test.ts tests/review/supply-boundary.test.ts tests/review/canonical-supply-transfer.test.ts tests/review/canonical-supply-view.test.ts tests/review/snapshot-read-composition.test.ts tests/review/read-hash-declared-actual.test.ts tests/review/read-hash-kernel-extraction.test.ts tests/review/snapshot-read-start.test.ts tests/review/read-hash-capacity.test.ts tests/review/read-hash-fake.test.ts tests/review/read-ops-fake.test.ts tests/review/source-map-supply.test.ts tests/review/source-map-values.test.ts tests/review/carrier-coverage.test.ts tests/review/seed-bootstrap.test.ts tests/review/bridge-work.test.ts tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts
bdo node tests/review/fixtures/compiled-capture-admission.mjs
bdo node tests/review/package-http-classification.mjs
```

| 確認 | 最終結果 |
|---|---|
| 新unit | 52件成功 |
| 関連回帰 | 27ファイル・1,709件成功 |
| build | npm run build成功 |
| strict型検査 | 新入口／testのstrict noEmit／noUnused成功 |
| lint | 変更TS／MJSのESLint成功 |
| 新compiled | binding19条件・root通常gate5箇所、薄い入口同一性成功 |
| 旧compiled | 既存対照、unbound16＋6・binding9＋5・start9を維持 |
| 梱包 | offline dry-run441ファイル・固定依存監査・seeded漏洩負対照成功 |
| 文書／差分 | 関連3文書のローカルMDリンク12件・fence確認、diff --check成功 |

上記は実装時の関連回帰であり、全repository回帰ではない。コミット対象だけの再検証は末尾に記録する。

## 未接続・停止線

CaptureAdmissionは発行だけでconsumerを持たず、PreparedClearAuthorityDraftはready=false／captureReady=not_connected。packet用の空originはあるが25cell・packet shell・CaptureReadyは生成しない。fieldWrites0、capture／finalAudit=not_connected、payload=not_started、proofIssuance=closed、rootFinish=not_called、resourceCleanup=not_startedのまま。内部Ack発行とPayloadGoneEvidence／正式発行を区別する。

次はAbsenceJournal・固定25cell生成／格納／同参照確認の合成実装。clear・全8群final audit・payload退役証拠・root終端は別工程であり、今回の発行counter・seal flag・空pendingを代替証拠にしない。shared fake classへの空origin追加費も含め、実E／S・全CPU／heap／layout・実OOM診断必着はUnknown。runtime source・実予算owner・cap・期限は変更せず、未コミット、Pushなし。

## コミット対象だけでの再検証（2026-11-09）

今回分の11ファイルだけを明示してstageし、index全体を一時ディレクトリへ展開した。既存node_modulesだけを参照し、展開先でbuild、関連27ファイル・1,709件、新入口／testのstrict noEmit／noUnused、変更TS／MJSのESLint、offline梱包とcompiled保証を再実行し、すべて成功した。binding19条件・root通常gate5箇所、旧対照・互換入口10本の同一性、梱包441ファイル・seeded負対照、文書リンク12件を確認した。検証後の変更は本記録の再検証追記だけとし、その他の対象が検証済み展開内容と一致することを再照合する。無関係な変更・capture・field clear・payload退役証拠・root終端・実接続等は追加せず、Pushは行わない。
