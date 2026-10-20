# BP-5 R-2 OL-03：index子phase・scan直前残予定量の合成検証

Date: 2026-10-20 / Scope: ローカル架空fixture・fake clock。実配備/PDI検証・全体受付ではない。

## 1. 変更範囲

[子phase設計§14](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md#14-index上界の子phase分解とscan直前境界)に基づき、既存indexモデルの上界を3枠へ分けた。PreScan完了は実Node照合後だけ発行し、scan後の全集合再照合・後側record再読/strict検証・最終index再検証を維持した。

元index ID/式/固定128/上限は維持。固定費は純indexとして20＋11＋10＝41で、旧互換ハーネスの45にはrecord projection4が含まれていた。record側への所有整理後も既存上界を縮めず、余り87はFinalIndexの上界枠に残す。phase制御は別途8/round、snapshotは4/回を元共有予算へ課金し、spentを返却しない。

## 2. 新規合成試験

| 試験群 | 確認内容 |
|---|---|
| 3roundの計数 | 初回/BeforeM4/AfterM4それぞれで子phaseの実費・固定枠と旧上界の一致。初回scan直前の残予定は2round＋AfterScan＋FinalIndex |
| spentとの分離 | 他工程へ7 work追加してもindex残予定は不変。snapshot費4を別計上し、完了でspentは戻らない |
| 一方向遷移 | 二重prepare・finish先行・二重AfterScan・二重finishをBindingで拒否 |
| 観測結合/全集合 | lineage/records/round/token差・missing entryはChanged。Readyのまま停止して次phaseへ進まない |
| Node失敗 | 対象size不一致でNode照合に失敗し、Ready planを返さない |
| model/scope | 未知phase modelはUnavailable、別budget・新nonceの同enum scopeはBinding |
| 中断 | phase経路の全fake clock点で期限を注入。取消は最終取消チェックより前の全点で停止し、既存理由を保持 |
| work不足 | prepare/snapshot/finishで上限到達するとLimit。未完了phaseを完了へ進めず、capを作り直さない |
| 深さ/chunk | 混在entry・depth64・escaped key・末尾空白、0/64KiB/64KiB+1/16MiB paddingの実課金と子phase式 |
| 算術/形状 | B=1/65535/65536/65537/16MiB、N=0/68/100000、P=最大6300063の計算器境界。旧bound不一致・u64 overflowでplanを返さない |

最大N/Pの試験は計算器に対する合成shapeであり、実際に10万件のpayloadを解析した結果ではない。通常pipelineの既存テストで3 index decode・6 record検証・6再読cycle・3新規scan、全件差/namespace差/失敗後停止を再確認する。

## 3. 開発途中に見つかった問題

- 初回コンパイルはphase moduleのpub(super)がstrict callerまで届かず失敗した。systematic-debugging手順で階層を照合し、可視性をstrict moduleまでに限定して修正した。crate/public APIへ広げていない。
- Node失敗テストはhashを変えたため、目的のNode照合より前のbindingで拒否された。sizeだけを4096→4097へ変え、目的の検査がChangedを返すfixtureに訂正した。製品のguardを緩めていない。
- 取消sweepは最終clock呼出し（866番目）でのみ期待と不一致だった。SharedBudgetはcancel判定の後にclockを読むため、そこで注入した取消は最終取消判定より後となる。この境界は成功があり得る競合として独立assertし、それ以前はCancelled、期限は最後のclockもDeadlineを要求した。協調停止で最終チェック後の取消まで保証するとは主張しない。

## 4. 維持する停止境界

全体work受付・予約・record profileの通常pipeline接続、scan/other上界、実reader/opener/collector、clock/lease/cleanup証明は未対応。snapshot scalarからplanやpermitを作る口はない。

APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止とtelemetry保留を維持する。実機操作・API実接続・token発行・設定変更・本番policy・permit発行・Pushは行っていない。

## 5. 実行・感度検証結果

- 新規10件（phase経路8件＋計算器境界2件）を追加。最初の全体実行は**561成功（5 suites、8.38秒）**、Clippyは問題なし。
- 4,006 entryの既存合成fixtureを固定fake clockで再実行し、現在のworkは**495,405**だった。前回495,381との差24は3round×制御8と一致する。index decode3・record検証6・scan3・前後再読6cycleを維持する。実閉包の性能・受付可能性は測定していない。
- remaining_scheduleを意図的にfuture_roundsだけへ変更し、未処理の現round費目を落とす変異を入れると、初回scan直前のテストが200,588対300,731で失敗した。変更を復旧し、未処理2子phaseを残す条件が検証に効いていることを確認した。

変異復旧後の最終再実行も**561成功（5 suites、12.07秒）**。release build、Clippy（-D warnings）、cargo fmtチェック、exec_probe fixtureのrustfmt、3文書のlocal link/fence/空白とphase式、git diff --checkも成功した。全体受付を有効化する試験や実機操作は含めない。
