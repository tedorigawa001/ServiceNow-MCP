# AP05：PK03／FX06の値kernel・旧実session経路・配布物検査の分離

Version: release-ap05-pk03-fx06-verification-split-draft-0.3 / Date: 2026-11-19。
Status: **試験分離の設計案。旧試験の変更・撤去・移行は未承認。** 静的基準HEADは `8b6e464`。[AP02撤去範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のAP02-S04、AP02-K03／04（旧K04〜06）、[B-03のFX06](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)、[AP01のNS06](BEST_PRACTICE_RELEASE_AP01_NS06_TIME_HANDOFF_GUARANTEE_REVIEW.md)を接続する。[PK01／FX05](BEST_PRACTICE_RELEASE_AP05_PK01_FX05_VERIFICATION_SPLIT_DESIGN.md)、[PK02／FX03・04](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)、旧UN62／新LM03は変更しない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`9f80c10`（修正時のHEADは`9f80c10`）。AP02基準へのリンク文字列で「AP02」が重複していたため、リンクを「AP02撤去範囲基準」とし、IDをリンクの外に出した。IDの対応・各行・判定は変更していない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`e4da77f`（修正時のHEADは`3806686`）。AP02基準への参照が新ID「S04」と旧ID「K04〜06」を混在させていたため、「AP02-S04、AP02-K03／04（旧K04〜06）」とした。§5に静的確認を追加した。H／P／N／Dの各行・判定は変更していない。

先行AP03差分、正式発行口・C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown・調査保留、現行期限と既定並列度を維持する。今回は静的照合とMDのみ。旧試験変更・skip、実装、撤去、build・梱包・展開、試験実行、混入操作、実接続・実通信、設定変更、公開、コミット、Pushは行わない。

## 1 H：現行PK03／FX06を変更せず保持する

[現行PK03](../tests/review/package-http-classification.mjs)は pack dry-run の一覧とリポジトリの `dist` を検査し、release比較契約・上位時刻owner・FX06のcompiled fixtureを別々のchildで実行する。FX06内ではkernelと `BoundedReadSession` の両方を同じchildの先頭でimportする。前半は値・固定依存だけでkernelを呼ぶが、**sessionなしでartifactが解決できる**ことまでは示さない。pack一覧とリポジトリdistの成功も、実展開した候補の成功ではない。child起動箇所に個別の明示timeoutはなく、別試験の60秒やfixture入力の `deadline_ms=60000` は起動の期限ではない。

| ID／旧検査 | 直接assertion・注入位置 | 保証しないもの／保持条件 |
|---|---|---|
| PKF3-H01／PK03 | `release-family`、`release-comparison`、`release-observation`、`release-comparison-receipt`、`release-time-owner`、`release-time-handoff` のJS・宣言・両map同梱と値moduleの依存境界。session宣言の旧時刻私有名非公開と、旧 `stop` から `#clearReleaseComparison` への直接呼出しを静的に確認 | 公開宣言からの不在はsession内の実行辺の不在ではない。旧stopの直結は旧Hの正対照として残し、候補Pの通常stopと一つの期待値にしない |
| PKF3-H02／FX06前半 [time handoff](../tests/review/fixtures/compiled-release-time-handoff.mjs) | 固定S／全deadline／O、同projection・ackとプレースホルダーのrun／budget／origin、空配列を `issue→compare→accept→handoff→sourceClosed` に渡す。`sourceGone=true` 後のinspectで上位 `observed_at=O` と比較slot=null、discard後の時刻=null、再handoffは `internal_review_error` を含むthrow | 空配列は値入力であり、空HTTP 200の取得・clock採取ではない。`sourceGone` はguardの合成対照であり、実session停止・実source closeの確認ではない。guardの呼出し数や各private slotの解放はassertしない |
| PKF3-H03／FX06後半 [同fixture](../tests/review/fixtures/compiled-release-time-handoff.mjs) | 実 `BoundedReadSession.prepareNewReviewComposition` に合成per-user・固定5列の親JSON bytes・非空Australiaのrelease JSON bytesを渡す。`prepared_only`、`cleanup=closed`、`reserved=0`、`evidence_issuance=disabled`、C=2／G=両bodyの合計bytes／P=0と、公開JSONの `/PRIVATE\|upper\|handoff\|Time\|projection\|comparison/` 非一致を確認 | 旧実classがsynthetic I/Oを受けて終了する経路の正対照。上位Oの実値や採取回数、各private参照の失効・実discard回数、timer/fetchの呼出し数、実worker送信を直接assertしない。空200のclass caseでもない |
| PKF3-H04／関連する旧対照 | [上位ownerのcompiled fixture](../tests/review/fixtures/compiled-release-time-owner.mjs)、[純粋handoff試験](../tests/review/release-time-handoff.test.ts)、[旧実classのTH01〜06](../tests/review/release-time-handoff-session.test.ts)を別々に維持 | owner単体の重複拒否、実classの空200／非空、post-O取消・cleanup確認はH02／03の直接assertionに加算しない。TH行の部分対応／未対応はNS06の判定を維持する |

Hは旧fixtureと元assertionを同revisionの旧buildで維持する。H03のsummary一致やconsoleの成功表示だけでH02・H04を合格にしない。将来の候補が旧synthetic入口を拒否することはHの故障ではなくPの別契約であり、Hを候補展開物に向けて期待値を反転しない。

## 2 P：候補配布物に残す値kernelと通常経路を別々に検査する

将来のPはAP02／AP03の確定内容を同じ候補revisionにpinし、空buildから作る配布物の隔離展開rootだけを使う。リポジトリdist・隣のbuild・開発loaderへのfallbackは不可。下記は合成入力での受入条件で、正式発行や実transportを開くものではない。

| ID | 正対照（未実施） | 読み替えない保証 |
|---|---|---|
| PKF3-P01／純粋kernel | H01の6 moduleとJS・宣言・両mapを維持し、固定の別compiled entryから同じ展開rootの値kernelだけを解決する。session・friend・Dに依存せず、固定S／O・同ackのH02相当の移譲、source guardの退役後もOを保持、比較slot消去、discard・再移譲拒否と、既存比較／上位ownerの値対照を確認 | moduleを残すことは新public exportの追加でも、通常sessionからhandoffを実行できることでもない |
| PKF3-P02／通常準備 | 通常importが成功し、options省略時の同期summary、2引数source、同sourceへの初期bind／`claimStatusBinding` と同coreの単一会計を確認。C/G/P=0・予約返却・固定close、dispatch不可・正式発行無効を維持 | 旧 `synthetic_io` の成功・時刻draft受理・比較候補とは別。summaryの値だけでprivate binding成功を推定しない |
| PKF3-P03／通常実行と停止 | 既存の通常session/sourceで、同じ `startedAt`・全 `deadlineMs`・pin済みpolicy、実release観測日時・従来判定とmatched時の通常Permit bindingを維持する。通常経路の `retrieved_at`／`reviewed_at`／`ended_at` は既存の生成元のまま。停止時は一次理由、run owner失効、signal・予約・固定closeを独立に確認する | 旧 `#clearReleaseComparison` を通らないことと通常停止自体の欠落を区別する。既存の時刻・worker出力は旧upper Oや `T_i`／`E` の正式bindingの証拠ではない |
| PKF3-P04／禁止入力と通常成功 | 同じ展開rootの通常成功を先に確認し、別入力でAP03の禁止own `synthetic_io` が同期 `invalid_input`、旧fake処理未到達となることを確認。C07-Bの通常2引数sourceも保持する | 入力拒否だけでは、到達不能に見える私有本体・登録や古い同梱物の不在を示さない |

## 3 P：sessionからの不在と混入検査を分ける

正常候補ではP正対照・不在の両方を要求する。混入対照はその候補から分けた隔離コピーで一件ずつ行う将来条件であり、この設計では実施しない。

FX06はSA／NDのような `take*Probe` を使わず、通常classの静的入口のsynthetic分岐を使う。したがって不在対象はclassや通常入口そのものではなく、そこから旧合成経路へ入る分岐・私有の結合と生成物である。SA／NDの旧named export不在はPK02の独立検査に残す。

| ID | 正常候補の不在・保持条件 | 検出すべき混入／欠落 |
|---|---|---|
| PKF3-N01／S04実行辺 | sessionから `createReleaseObservation`／`createReleaseTimeHandoff` へ入る旧合成専用辺、`ReleaseInputOrigin`／`ReleaseInputProjection`、`#releaseInput*`・比較／時刻診断の旧runner、constructor／stop／rollback／prepareからの旧呼出しを残さない。値module内部と許可済みの値依存は保持する | 直接呼出しの復活、別名・再export・解決した動的辺、未exportだが登録／呼出しが残る本体を別々に検出。module名の一律禁止にはせず、未解決辺はUnknown |
| PKF3-N02／配布層 | 展開物のJS・宣言・JS map・宣言map（埋め込みsourceを含む）に旧session接続・fake型／登録・開発rootの残留がない。候補の型／export拒否は通常moduleが解決できたときに限り判定する | stale JS・宣言・各mapの混入を別コピーで検出する。宣言だけの不在やmodule全体のimport不能を合格にしない |
| PKF3-N03／保持側の欠落 | 6 moduleの同梱、通常sessionの停止・資源解放、通常の時刻・policyの生成元を維持する | 必須module／mapの欠落、通常stop／closeの削除、時刻を旧upperの値で代用する変更をP正対照の失敗として区別する。不在検査が通っても相殺しない |

## 4 D：開発側の補完と未代替保証

| ID／対象 | 別build・別brandで補完できるもの | 旧Hに残る保証・回復条件 |
|---|---|---|
| PKF3-D01／時刻・release比較 | [開発release採用試験](../tests/review/development-release-adoption.test.ts)のtest-only条件によるS／O、同開発sourceのreceipt・非実行比較summary、空／非空とholdbackをcompiled候補にする | DのO事前入力は、旧実sessionが同200の同bytesを課金／解析し、取得後guardの後にclockを一度採る保証を代替しない。空200のO保持と、設定なし空200の旧 `release_not_admitted` をDのUnknownに換算しない。回復には同session／projection・同source／ack・同S／全deadline／policy、採取位置と回数の観測が要る |
| PKF3-D02／上位時刻への移譲と取消 | Dで同receiptの一度限り受理、混入拒否と対照側ownerの非干渉を検査候補にする。cleanup後のcancel／deadline／時計throw・逆行は `release_comparison_withheld` にのみ反映し、完了したrunの `ok`／`code`／`run_primary` を書き換えない | Dのwithheldは旧実classの同accepted→heldへの移譲、`sourceClosed` 前後のguard切替、固定finallyのdiscard、TH04／05の同期／予約後取消とTH06のpost-O sweepを代替しない。回復時は停止位置・前後のO・保持slot・一次診断を照合し、一次cleanupの未実行が後続rollbackで隠れる場合も区別する。worker jobへの `T_i`／`E` の正式結合は依然未接続 |

Dは旧friendを取得せず、Pのsession／Permit／私有受領物を流用しない。H／P／Dは対象revision・成果物・旧assertionとの差・失敗理由・子process終了を別記録にする。AP01／AP04で未代替保証の処遇、AP05で展開・混入対照と切替、B-03で隔離・終了確認をそれぞれ判定するまでは、旧試験と現行梱包条件を維持し、配布物の不在を根拠に旧試験を削除しない。

## 5 静的確認

基準`e4da77f`で、PK03（package-http-classification）のpack dry-run一覧とリポジトリ`dist`の検査、release系6moduleのJS・宣言・両map同梱と依存許可・時計／I/O／timer禁止、session宣言の私有名9件の非公開と`stop`から`#clearReleaseComparison`への直接呼出し、release比較契約・上位owner・FX06の別child起動と明示timeoutの不在（H01）、FX06 fixtureの先頭import・前半の移譲／discard／再handoff拒否と後半の`prepareNewReviewComposition`の各assertion（H02／03）、H04の参照3ファイルとNS06のTH01〜06、N01の旧接続名と`synthetic_io`分岐、AP02-K04の通常準備経路（P02）を静的に照合した。本書のID13行（H4／P4／N3／D2）、表4・ローカル参照12・明示anchor0、参照先・表列数・末尾改行・差分空白を確認した。製品・試験・設定の差分はなく、製品module import・試験再実行・build／pack・実展開は行っていない。
