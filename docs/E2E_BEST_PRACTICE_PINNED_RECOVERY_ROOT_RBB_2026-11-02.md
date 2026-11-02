# RB-B 同pin／receipt・固定recovery供給の合成検証

Date: 2026-11-02 / Baseline: `e0c19a2` / Status: 合成依存限定・FinishContextEvidence発行なし。

対象：[RA-02③接続差分設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_FINISH_ASSEMBLY_RA02_BINDING_DESIGN.md)§9。新しい固定入口`createSyntheticPinnedRecoveryRoot`と純粋な共有pin helper、専用試験、梱包監査・CHANGELOG・設計書を更新した。legacy recovery kernel・RB-A入口・既存試験は変更していない。data-only assemblyはpin生成の最小抽出だけで、元API・状態機械・post-guard commitを維持する。

## 同一性・供給境界

- 構築descriptorはkind／point／active_input_sys_id／accounting／consistency／finishだけ。同bounded pinのrun contextからrecovery seedを作り、active inputは同ledgerの未処理receiptに結ぶ。completed／存在しないactiveは拒否する。
- SC2-Aへのsource／budget／release／origin／windowとselected・全receipt／ID／T_i／stateは同pinから固定供給する。固定supplierの明示照合に加え、既存SC2-A検査でsource等・active receipt・集合／時刻を再確認する。windowは既存SC2-Aに元pinとの比較機能がないので、同immutable構築とsupplierの照合が責務を持つ。
- 元reviewedの期待contextとimmutableな合成pin、omitted起源はprivate ledgerに残し、SC2-Aには既存のstate／reasonだけを渡す。元analyzeのpost-guard受理やfull結果の検証を証明したとはしない。
- callerはbinding／recovery claimとstrictな旧closureのfake終端eventだけを渡す。旧kernelのbegin→settleまたはconfirm-unstarted→prepareを同ownerで行い、一時的な旧合成closure証拠は内部使用する。新しいfinish証拠を外へ発行しない。
- source／window／release／receipt／raw input／callbackを準備時に差し込む口はない。元kernelのguard／busy／hard／claimを一つだけ使い、別ownerや失敗後の再生成を拒否する。
- accountingは構築時prefixを継承し、新たなC/G/P計上・retry／HTTP／解析／clock採取は行わない。verifyは明示nullで、構築consistencyを保持する。

公開inspectは件数・固定状態／診断・会計prefixだけ。pin・ID／UTC・期待context・release値は出さず、route_bound=false／evidence_issues=0を維持する。preparedをheldのまま正常closeすることを拒否し、成功時は同handleの固定discard後にcloseする。未確認の旧termination／cleanupは診断へ残し、参照破棄を成功へ読み替えない。

## 検証結果

| 確認 | 結果 |
|---|---|
| 新規RB-B合成試験 | 89件成功 |
| 関連回帰（RA-01／02・RB-A・legacy・SC2-D含む） | 6ファイル、653件成功、失敗・保留0 |
| 全体合成回帰 | 249ファイル、11,711件成功、失敗・保留0、約33.3秒 |
| build | `npm run build`成功 |
| strict型検査 | helper／data-only assembly／新root／新試験をstrict／noUnusedで検査し成功 |
| ESLint | 上記4ファイルと梱包監査で成功 |
| 梱包確認 | `node tests/review/package-http-classification.mjs`成功、441配布ファイル。新helper／root／型／brand／scopeの非同梱とruntime／I/O／clock／worker混入の負の対照を確認 |

全体回帰は既存ローカル待受試験を実行できる条件、maxWorkers=3で実施。既存の製品／試験期限は変更せず、150秒の外側観測停止も発動していない。実サービスへの通信は行っていない。

## 主な対照と初回経緯

- 新module未存在のREDを確認してから実装。最初の新経路＋旧data-only assemblyの2ファイル90件が成功し、その後に混入・停止・境界対照を追加した。
- 1／100件のwindow、accountingの0／上限、固定7topology、activeが最新でない複数未処理inputを確認。Uは全inputから維持され、activeのT_iへ切り下げない。
- reviewed pinとomitted起源あり／なしを区別し、初回fixtureの変更や同値のcaller handleで置換しない。
- 他root／copyのbinding・recovery・preparation、RB-A／legacy bindingを拒否し、相手rootは不変。不存在／completedのactive、重複ID・receipt差込み、source／window／release等の余剰field・追加引数も拒否する。
- 全12guard位置の取消、期限切れ後の再準備、swallowされた再入、二重prepare／discard、heldのままclose、旧termination／cleanup未確認を確認。最初のhard理由を保持し、pin参照を破棄して復活させない。
- getterを呼ばないこと、秘密／UTC／ID／pinをinspect・例外から返さないこと、preparationがFinishContextEvidenceではない静的brandを確認。

公開入力からの混入拒否を検証したのであり、既存実sessionの取得証拠・実結果やOS workerの状態を検証したものではない。純粋helperの型・戻り値はtests配下の固定構築だけに使い、runtimeの登録台帳や発行口にはしない。

## 未対応

RB-Cのsource open／ready受理origin／cleanup開始serial、RB-Dの同handoff結合は未実装。新世代起動・verify後のlimitations／errors合流・FinishContextEvidence発行・原子的受理・finish／E／候補・正常source／worker cleanup能力は別工程。

seed copy・RA-01検査・最大100行のsupplier照合・SC2-A再検査・guard・診断・破棄には追加work／allocationが必要。C/G/Pが不変でも費用0とはしない。exact layout／allocation・全体work上界・本番capはUnknown。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持し、実接続・実通信・実機操作・設定変更は実施していない。
