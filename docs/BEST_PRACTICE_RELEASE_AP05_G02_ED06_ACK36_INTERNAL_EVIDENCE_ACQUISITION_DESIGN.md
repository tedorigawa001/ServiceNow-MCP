# AP05 G02：ED06／ACK-36 外部資料に依存しない通常経路の証拠取得案

Version: release-ap05-g02-ed06-ack36-internal-evidence-acquisition-draft-0.1 / Date: 2026-11-20。

Status: **設計案のみ。開発用owner対照の実績は補助証拠。通常経路の追加対照、候補での単独欠失・非介在観測は未実施・未承認。ED06の処遇・回復は未決定、外部利用はUnknown、閲覧0。候補revision・digest・観測手段は未確定、G02未充足、SL01起動0。**

[未変更候補の観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)と[開発用owner対照の結果](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_OWNER_REGISTRATION_CONTRAST_RESULT.md)を前提に、外部資料の提示を待たず進められる確認と、依然として埋まらない穴を分ける。読取り基準 `32a24ae` は製品候補ではない。外部利用への影響確認・旧Promise拒否保証・通常経路の維持の三つは別判断。

## 1 証拠を三つに絞る

| 証拠 | 取得経路 | 言える範囲と限界 |
|---|---|---|
| 通常の実結合・前進・終了（正対照） | まず現行source上の実session／実sourceで、既存の合成fetchだけを使う開発用対照を1本追加する案（§2）。将来の候補では、別承認後に同一の未変更展開物を使う[SL09の正対照](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)に戻す | 同じsourceが発行したPermitで最初のmetadata取得に進むことと、当該runの停止・解放を区別。開発実績を候補に持ち越さず、正対照だけで登録欠失を拒否したとはしない |
| 通常経路で登録を飛ばして通過しない構造 | 現行sourceで判定までの呼出しを確認し、将来は同候補の隔離展開物で、実解決したJS・entryに沿って再照合する（§3） | どの条件が実行順の前提になっているかを示す。文字列の有無やbuild元のsourceだけでは候補の構造を確定せず、実行時の拒否を観測したとも扱わない |
| 登録なしの拒否と期限先行の区別（負対照） | 既存の実owner関数を使う開発用合成対照を補助証拠として保持する。候補の通常経路では、正規Permit／portを保ったまま登録だけが確定しない適格な既存境界と、先行拒否を介入なしで区別する手段が出た場合だけ別実施審査 | 開発側の結果はowner判定まで。候補の通常metadata guard、実取得／dispatch未到達、実終了四軸、旧ACK-36の後段Promise拒否は代替しない |

## 2 最初に取得する通常正対照：現行source、開発側で1本

[既存のsource-release-binding正対照](../tests/review/source-release-binding.test.ts#L12)は通常metadataの手前で `reviewReleaseStatus` と `reviewRunStatus` を呼ぶ。この2つを**最初の通常guardより前に挟まない**ことが追加対照の目的であり、既存試験を変更・置換しない。

1. 通常の実session、通常2引数の実sourceと合成fetchを使う。許された固定の親・release・metadata応答だけを返し、想定外の取得は別理由で拒否する。実外部接続や開発loader、prototype／メソッド置換、外部からの登録作成・成功値注入は使わない。
2. 親 → releaseの `matched` → 同sourceから受け取った正規Permitで最初の `listMetadata` を連続して通す。先行の状態問い合わせ・時計／lease確認・断点を追加しない。合成fetch自身が受けた到達順と件数を記録し、各応答とmetadata結果を照合する。観測前にサンプルを取り直したり、固定期限を延ばしたりしない。
3. metadataの後でだけ同sessionの公開会計と結果を照合し、通常の終了経路を通した後に無効化／解放の確認を分ける。完了の根拠がない項目はUnknownとする。追加のpayload・worker dispatchは要件にしない。既知の終了と、将来の候補系列で必要なrunner／worker／stdio／cleanup四軸を混同しない。

この対照の追加・対象実行は**別承認**。候補の実行・梱包や、旧試験の切替を含めない。期待値は正規のmetadata到達・返却・会計を同runで示すこと。単にgetterや `matched` が成功しただけ、別sessionや期限変更で通った場合は受け入れない。

## 3 候補段階で確認し直す順序と停止条件

現行の確認点は、[Permit／portの生成とbindより後でのmatched返却](../src/review/bounded-source.ts#L193)、[bindingの確定より後でのowner成功](../src/servicenow/review-evidence-lifecycle.ts#L242)、[bindの不成功ならthrowするsession境界](../src/servicenow/bounded-read.ts#L632)、[取得より先のmetadata guard](../src/review/bounded-source.ts#L224)。候補では通常entryからこれらの実体に到達し、**正常返却・取得へ進むすべての当該分岐で必要な検査が先行する**ことを、同じ入出力と参照、実解決先、依存差分・別名／転送も含めて確認する。関数名・文字列検索、一つの正対照、別のdistだけでは確定しない。

その構造とP+が揃っても、[既存ownerのguard](../src/servicenow/review-evidence-lifecycle.ts#L94)が欠失を起点に拒否する通常候補の陰性runそのものにはならない。

- **現行要件を維持する場合**：未変更候補の通常経路で登録だけを欠かせる既存境界と、最初の拒否を変えずに観測する手段の両方が必要。境界が見つからなければ、入口同期拒否、旧prototype置換、取消や外向きの `internal_review_error`、PΔを割り当てて埋めず、ED06保留・起動0。
- **複数の根拠による再審査案を出す場合**：候補の構造、同候補の通常正対照、開発側のowner負対照と残差を**別欄**で提示する。何が未観測か、旧ACK-36の保証をどこまで説明できないかを明記し、証拠の採否・受入条件を別決裁する。非提供・無影響・同等・公開可の自動判定にしない。

今回、対象資料の指定・外部照会・閲覧、候補変更・実装・試験実行・梱包・コミット・公開は行わない。旧試験／期待値、正式発行口・C実行入口／body起動閉鎖、全体受付無効・調査保留、閲覧0・候補起動0を維持する。
