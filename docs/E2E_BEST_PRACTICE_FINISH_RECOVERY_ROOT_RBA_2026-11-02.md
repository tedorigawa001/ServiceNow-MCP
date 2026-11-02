# RB-A 共通recovery kernel・閉鎖した新rootの合成検証

Date: 2026-11-02 / Baseline: `3787799` / Status: 合成依存限定・finish証拠発行なし。

[RA-02③接続差分設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_FINISH_ASSEMBLY_RA02_BINDING_DESIGN.md)§8の生成境界だけを実装した。RB-B〜Dのpin／receipt供給・live route・handoff結合は未実装。

## 実装・互換性

- 旧`synthetic-soft-recovery.ts`の本体を`tests/support/review/synthetic-recovery-kernel.ts`へ移した。HEADの旧本体と比較し、先頭comment・factory名以外が完全一致することを別途確認した。
- 旧factoryの引数／default／戻りAPI・型exportは薄いwrapperで維持し、旧試験とRA-02①②のhelper／試験は変更していない。既存rootへの可変mode・外部登録・setterは追加しない。
- 新規`synthetic-finish-recovery-root.ts`は、strictなkind／time／pointだけから新kernelを一つ生成する閉鎖facade。参照・binding・guard／busy／hard／claimの別台帳を作らず、元kernelのpre／postとidentity検査を利用する。
- worker topologyの固定7variantはdescriptorのpointから内部構築する。caller seed／facts／owner／receipt／frameは受け取らない。binding・observation・recoveryは新入口専用の静的brandで区別し、同一kernel発行objectをそのまま返す。
- 新入口はbind→observe→claim→authority:none消費のprefixだけ。prepare／新世代／handoff／route受理／finish発行は公開しない。inspectはUTC／identity／materialを返さず、route_bound=false・evidence_issues=0。
- 失敗／close時はfacadeの構築materialも参照を外す。raw例外・入力内容を出力せず、最初のhard診断を保持する。物理heapの消去や実resource cleanupを証明するものではない。

## 検証結果

| 確認 | 結果 |
|---|---|
| 新root専用合成試験 | 67件成功 |
| 旧issuer・RA-02①②等を含む関連回帰 | 13ファイル、1,441件成功、失敗・保留0 |
| 全体合成回帰 | 248ファイル、11,620件成功、失敗・保留0、約31.9秒 |
| build | `npm run build`成功 |
| strict型検査 | 新kernel・旧wrapper・新facade・新試験をstrict／noUnusedで検査し成功 |
| ESLint | 上記4ファイルと梱包監査の5ファイルで成功 |
| 梱包確認 | `node tests/review/package-http-classification.mjs`成功、441配布ファイル。新kernel／root／関数／brand／scopeの非同梱、固定import graphとruntime／I/O／clock／worker混入の負の対照を確認 |
| 機械抽出の独立確認 | 実装helperを使わず、gitの旧本体をcomment／factory名だけ正規化して新kernel全文と比較し一致 |

全体回帰は既存ローカル待受試験を実行できる条件でmaxWorkers=3、既存製品／試験期限を維持した。150秒の外側観測停止は発動していない。実サービス通信は行っていない。

主な新試験：固定7topology、正常操作ごとに元kernelのguardが2回だけ動く対照、別root／copyのbinding・observation／claimと旧issuer bindingの混入拒否、旧issuer不変と旧phase消費の維持、各操作の二重利用、全8guard位置の取消・失敗後の再開拒否、swallowされた再入失敗、strict不足／余剰key・不正時刻、constructor data変更の非採用、getter／Proxy／symbol・任意point objectのcoercion拒否、bind／observe追加引数の拒否、別静的brandと秘密／UTC非出力を確認した。

## 初回RED・失敗と訂正

1. 新module未存在のREDを確認してから、共有kernel抽出と新facadeの最小prefixを実装した。旧issuerとの最初の2ファイル125件は成功。
2. 境界表の拒否例でOをUと同値に設定し、1件が期待どおり拒否されなかった。既存kernelはO＝Uを合法としていることを照合し、O＞Uへfixtureを訂正、O＝U受付の正の対照を追加した。実装・期限の条件は変更していない。最終67件は成功。

## 未対応・保証しないこと

新rootのactive inputは内部placeholderであり、RA-02①②のselected／receipt／期待contextとまだ結ばれていない。新入口から元SC2-Dまでの連続経路、同pinとreceipt ledgerの供給はRB-Bへ残す。新入口で旧回復操作を単に全公開する方式や、外から既存ownerを採用する方式は使わない。

SourceLifecycleSlot・ready受理origin・cleanup開始serial、同handoffの結合はRB-C／Dで未実装。元kernelのworker-startedをcleanup-startedへ読み替えない。証拠発行・原子的受理・finish／E／候補・正常source／worker cleanup能力は別工程。

これは合成kernel／facadeの保証であり、実class／session／workerの正式bindingや実結果の由来の証明ではない。構築・診断・guard・破棄のwork／allocationは未導出で、会計更新なしを費用0の証明にしない。全体work／layout／allocation・本番capはUnknown。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持し、実接続・実通信・実機操作・設定変更は実施していない。
