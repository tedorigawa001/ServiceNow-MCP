# RB-D 同plan／handoff・private pin・live routeの合成結合検証

Date: 2026-11-02。Baseline: `7f0b81d`。対象は開発専用の合成assemblyのみ。

## 1 実装範囲

同constructorのprivate pinと元plan／handoffを一度だけ結合する。元receipt／集合／T_i／U／時刻／verify事実と元frameの参照を保持し、同source／ready origin／cleanup identityを検査する。pre/post guard後だけboundを公開し、source close開始・cleanup開始・hard停止で同期失効する。summaryやコピー、別root、任意raw値からの昇格口はない。

値projectionは由来を証明しない。現在の合成準備経路はverify=null。private結合状態を診断するだけで、finish証拠・issue／accept・正常finish能力は発行しない。固定discardはsource close完了と新cleanup確認の両方を要求する。

## 2 合成検査

- 一度限りの結合・移譲、同owner／source／receipt／window／release／frameの同一性。
- 混入・コピー・重複・競合・再入・取消・期限切れ・失敗後の再利用拒否。
- pre/post guard中は未公開、post guardの停止理由を値検査エラーで上書きしない。
- source／cleanup開始による即時失効、解放未完了のdiscard拒否、hard後の診断保持。
- 独立fixtureによる集合・completed・verify優先事実・会計prefixの不一致拒否。
- 空／混在状態・100件window、limitations上限、errors切詰め、元frame参照保持。
- 旧factoryのAPI／診断型維持。公開summaryは件数のみ、秘密・時刻・identityを非出力。

## 3 REDからGREENへの記録

初回は新しいseal／binding APIがなく失敗した。追加した不正verify進捗6件とcompleted／warnings／errors／会計不整合7件も当初通過したため、元入力と派生事実の一致検査を追加した。値検査失敗とpost guard取消／期限切れの競合2件では固定internalエラーが先行したため、work失敗を一旦保持し、post guardの停止を優先してからcommitする形に修正した。途中の未使用import・型付きkeyのコンパイル失敗も修正後に再検証した。

## 4 最終検証結果

2026-11-02、製品・試験の期限は変更せず実行。

| 検査 | 結果 |
| --- | --- |
| RB-D新規合成テスト | 99件成功 |
| 関連8ファイル | 855件成功、失敗0 |
| 全体Vitest（maxWorkers=3） | 251ファイル・11,874件成功、失敗0・skip0、約38.6秒 |
| `npm run build` | 成功 |
| strict TypeScript検査 | 成功 |
| 変更した5ファイルのESLint | 指摘0 |
| `node tests/review/package-http-classification.mjs` | 成功、441ファイル |

全体試験はローカル待受が可能な条件で実行した。PDI・外部サービスへの通信は行わない合成試験であり、実環境の保証ではない。梱包検査では新helper／型／scope／試験を除外し、依存グラフとruntime／I/O／clock／worker混入の負の対照を確認した。全体回帰のJSONは一時検証出力であり、リポジトリへ保存しない。

## 5 残課題と維持条件

元analyze受理capture・finish発行slot／RA-03受理・full wire比較・E／終了候補・正常source／cleanup能力は未実装。guard・値収集・参照保持・破棄の追加work／allocationは未導出でUnknown。会計prefix不変は追加費用0の証明ではない。

正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持。本番cap・実worker／runtime・実接続・実通信・設定変更・証拠発行・Pushは行っていない。

設計: [RA-02③接続差分draft-0.6 §11](BEST_PRACTICE_ABORT_SCOPE_FINISH_ASSEMBLY_RA02_BINDING_DESIGN.md)。
