# AP05 G02：ED06／ACK-36 通常経路の代替受入条件・個別審査案

Version: release-ap05-g02-ed06-ack36-alternative-acceptance-proposal-draft-0.2 / Date: 2026-11-20。

Status: **ED06の通常経路に限り①〜③の代替条件を採用。入場条件を満たす候補の起動は承認済み。候補未指定、入場条件未充足のためSL01は起動0。候補固有の証拠・ED06の受入判定・旧保証の処遇・公開は未確定または未承認。**

対象は[ED06／N2-R11の個別票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のうち、通常経路で登録なしのまま取得に進まないことを裏づける条件だけ。[複数証拠の個別審査](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_COMPOSITE_EVIDENCE_INDIVIDUAL_REVIEW.md)では、現行sourceの順序、開発側の通常正対照、実ownerを使った合成対照を補助証拠とした。[未変更候補の現行観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)と元の承認票は変更しない。

## 1 審査する命題と、直接は観測しない範囲

審査するのは、**同じ候補配布物の通常経路で、登録に失敗すれば `matched` を返さず、最初のmetadata取得に進むには同Permitでの登録照合が必要**という命題。現行sourceを[静的に照合した範囲](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)では、bindの失敗はrelease段階で止まる。正規のPermit／portと同owner／readyを保ったまま、登録だけを欠かせて後段まで進める適格な入口は未確認。候補でも不可能と証明したわけではない。

採用した条件でも、**同じ未変更候補の通常adapterで、正規のPermitを保持したまま登録だけが一度も成立せず、最初のmetadata guardまで到達し、その場で実際に拒否されたか**は直接観測しない。この観測を①〜③とは別の必須証拠にしない一方、そのrunの外向き拒否理由、取得／dispatch未到達、解放を確認済みとはしない。releaseでの先行拒否や閉鎖後の拒否を同位置の直接対照と数えない。

## 2 採用した代替受入条件（3点すべて。候補固有の証拠は未取得）

| 証拠 | 合格に必要な内容 | 別欄に残すもの |
|---|---|---|
| ① 同候補の構造照合 | 同一tarballの隔離展開で、固定した通常entryからsource・session・owner・adapterの**実解決先**を照合。通常の観測結果と既存fallbackの両方について、同source／Permit／portの登録確定後だけ `matched`、bind失敗は先行停止、最初の通常取得は同Permit・同owner／ready・登録guardを通過した後だけと示す。別名／転送・動的参照で片側が未解決、guardを迂回する辺、候補内容の不一致があれば不採用 | 現行TypeScriptの静的検査器は候補JS用の根拠ではない。合成の構造変異は検査の感度を示すだけで、候補の負対照として加算しない |
| ② 同候補の通常正対照 | 同じ展開・実解決先でfresh session。通常factoryと2引数sourceから、親／release、実bind、同じPermitによる最初のmetadata、固定のrequests／受信bytes／payload会計、正常停止・解放と閉鎖後の追加取得なしを確認する。guard前に診断を追加しない。対象entry・合成依存・post-pin・終了を別記録にする | source/sessionまでの対照をadapter／workerの実行・終了へ広げない。runner／worker／stdio／保全の終了判定はG04で別に行い、未起動と未確認を区別する |
| ③ 同実装のowner欠失対照 | ①②の登録guardと同じ候補のowner実装を、別のfresh合成runで使う案。初期結合・有効ready・固定leaseと合成Permit／portを保ち、登録済み／登録なしだけを分ける。期限内の登録なしは `binding / evidence_binding_mismatch`、期限等号は `owner / deadline_exceeded` が先行すること、合成の後続未到達と先行理由の保持を区別。最初のguard前に追加観測しない | 現行の[開発owner対照](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_OWNER_REGISTRATION_CONTRAST_RESULT.md)は手法の根拠まで。合成Permitは実source発行のPermitではなく、到達印は実I/Oではない。候補から同実装を特定・使用できなければ不採用。新friend・公開getter・本番hook・loaderの差替えは用いない |

①〜③は同候補・同じ実装の確認に結ぶが、別の観測である。いずれかが欠落、不一致、未確認なら代替案は不採用／保留。ごく一部の成功、旧試験の成功、単なる不在・一般の起動失敗を足し合わせて合格にしない。未観測はUnknownのまま保持する。

## 3 採用・起動承認の記録

根拠は2026-11-20のユーザー指示「条件の採用と候補の起動を承認します」。draft-0.1の審査方針のみの承認を、次の二点に更新する。原票の旧保証・処遇と他ケースは変更しない。

1. **受入方式の採用：** ED06の通常経路の命題に限り、未変更候補で行う直接欠失対照に代え、①〜③のすべてを要求する。観測しない範囲は方式の限界として明記する。①〜③が揃うまで、この命題の候補固有の受入判定は保留。
2. **候補起動の承認：** 対象を指定し、[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)を満たした候補の検証起動に限る。起動の許可は得たため、同じ許可をもう一度求めない。候補変更の本体適用、入場条件の省略、未定の時間・観測／保全方式の選定、旧保証の処遇や公開の権限は含まない。

| 個別票の欄 | 今回の状態 |
|---|---|
| A1-P01〜04／対象・残差 | ED06／ACK-36・N2-R11のみ。通常取得に関する代替条件を採用。候補固有の受入結果がないこと、直接観測しない範囲は別欄。候補revision・digest・観測手段は未確定 |
| A1-P05〜06／責務・再審査 | 旧試験保持は開発側、通常結合・停止・解放はsession／source・登録owner、候補の実体照合は配布審査、終了・保全は外側owner。担当者、期限、手段、数値・保全方式／先は未確定または未承認。適格な直接対照が見つかれば別に再審査 |
| A1-P07〜10／処遇・決裁 | 証拠方式と条件付きの候補起動のみ承認済み。旧保証の処遇、AP02本体適用、AP04結果差、AP05旧試験切替・候補の受入、AP06公開は未承認。対象候補版は未記入。ED01〜05・07や他のNSへ波及させない |

## 4 起動前の照合結果：SL01起動0

| 順に解消する不足 | 今回の照合 |
|---|---|
| G01／対象差分と通常経路 | [G01照合表](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)に仕様根拠はあるが、対象候補と撤去する辺／残す通常経路の対応は未確定。ED06の隔離試作は本体への適用承認も候補指定も受けていない |
| G02／入場時の許可と事後の判定 | ED06の方式・起動許可とは別に、旧保証の個別処遇、残りの影響行・許可範囲が未確定。①〜③には候補の生成・展開後にしか取れない証拠がある。取得予定を合格にせず、入場時に必要な根拠と取得後の判定を分ける案が必要なら、先行を許す範囲・slot・停止条件を別途承認する。現行規則に例外なし |
| G03／候補の同一性 | [段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)の候補commit／tree・検査器／fixture・Node／依存を未指定。照合時のHEAD `32a24ae` は1.16.2の基準記録であり、この限定移行の候補にはしない。未生成のtarball digestは現段階の不足とはせず、生成時の確認に残す |
| G04／安全に起動・終端できる根拠 | [隔離・終了と保全](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)に必要な対象slot・責務先、外側時間枠・cleanup予約、観測と保全手段／保全先は未承認。未確認の状態で試しに起動しない |

次に必要なのは、起動の再承認ではなく、**AP02の対象差分を確定して候補化できる根拠と、候補固有の証拠を入場後に得る場合の入場前条件を切り分けること**。不足中は先行保持も登録せず、build／梱包／展開、検査器・候補の起動いずれも0。

旧ACK-36の旧syntheticでの**返却Promiseの `internal_review_error`**は通常経路の命題と別。旧試験、元の故障位置・期待値を維持し、案Pの早期同期 `invalid_input` をその代替としない。外部利用はUnknown、閲覧0。正式発行口閉鎖・全体受付無効・調査保留を維持する。今回の変更は本MDのみで、実装・試験・梱包・実通信・コミット・Push・公開は行わない。
