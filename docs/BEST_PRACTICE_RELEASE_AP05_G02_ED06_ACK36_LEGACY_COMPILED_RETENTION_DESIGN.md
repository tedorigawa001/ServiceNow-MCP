# AP05 G02：ED06／ACK-36 旧compiled検査の保持方式

Version: release-ap05-g02-ed06-ack36-legacy-compiled-retention-design-draft-0.2 / Date: 2026-11-20。

Status: **固定旧版での再生成・旧検査の無変更維持を保持方式として採用。実行・保全は未承認。候補未指定、G02未充足・SL01起動0。** [ED06差分審査](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_AP02_PATCH_REVIEW_HANDOFF.md)の旧PK01／03・FX05／06に限定し、ED06の代替条件／起動承認を旧試験の切替や本体適用には拡張しない。

## 1 保持するもの

| 旧検査 | 元コードが実際に確認すること | 保持時に外してはいけないもの |
|---|---|---|
| [PK01](../tests/review/package-canonical-budget.mjs)／[FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs) | 旧rootでofflineのpack dry-run一覧を取り、fake I/Oを含むJS・JS map・宣言・宣言mapを同梱必須とする。旧rootの `dist` を読み、canonical関連のcompiled子4本を起動。FX05は旧実classの正常prepared・両入力bytesの会計・閉鎖・権限非公開を検査 | 元wrapperと子4本を変更しない。同梱期待を不在へ反転しない。FX05の成功を旧ACK-36の強制bind欠失・Promise拒否に読み替えない |
| [PK03](../tests/review/package-http-classification.mjs#L295)／[FX06](../tests/review/fixtures/compiled-release-time-handoff.mjs) | 同じく旧rootのpack dry-run一覧と `dist`、各種fixtureの元sourceを読む。通常sessionの `stop` が `#clearReleaseComparison` を直接呼ぶことをASTで照合。FX06は値kernelの移譲／破棄と、旧実classのfake I/O・同bytes・閉鎖を同じ子内で別検査 | 元wrapper全体を維持し、固定位置から起動される子25本を省かない。FX06の純粋kernel側だけを実行して旧実classの保証としない。時刻・取消に関する他の旧source試験も削除／skipしない |

両wrapperは `import.meta.url` から旧rootを決め、旧compiled fixtureも相対指定でその `dist` を参照する。**dry-run一覧は配布予定の一覧であり、展開したtarballを実行した結果ではない。** また [`npm run test:pack`の入口](../package.json#L32)は別の[package-worker検査](../tests/review/package-worker.mjs#L14)で、実pack・依存導入を含む。今回の保持経路の代用にしない。

## 2 保持方式の比較

| 方式 | 判定 |
|---|---|
| **固定旧版を隔離し、空buildから旧wrapperを無変更で実行** | **推奨。** 旧commit／tree、元wrapper・元fixture、包一覧の設定・lock、Node／npm／TS／依存実体を一組にできる。候補側とroot・cache・結果を物理的に分ける。必要な旧依存をローカルで固定できない、外部通信を排除できない、終了と引受を確認できない場合は実行しない |
| 先に保全した旧buildの再利用 | 補助・再現が難しいときの別案。旧buildの生成記録、同元tree、元source／fixture、依存・環境、完全な `dist` と各再読取りの照合が別途必要。旧公開tarballやバージョン文字列の一致だけでは、非同梱のfixture・開発側のcompiled依存を補えない |
| 候補の同じ成果物で旧wrapperを動かす／候補に旧入口を戻す | 不採用。fake I/Oの同梱必須と候補の不在必須、直接の時刻失効呼出しの旧期待と旧専用辺の除去が衝突する。候補へのfallback、shim、旧期待値の変更、試験の一部抜粋で両立させない |

旧版の選定の出発点は旧source分離試験と同じ `32a24ae1947383d89577a18dac77c49ff55b24b8`／tree `60cfcda9554cd6efcfab5560060cb6619ae87ad5`。**旧compiled成功版と確認した記録ではない。** 旧source試験42件の記録だけではwrapper 2本やcompiled子の完走を証明しない。

## 3 推奨案の準備、終了と結果の保持

1. **入場前に旧版と隔離境界を固定する。** 旧wrapperから参照される全fixture／source、package／lock／tsconfig、Node・npmの実体、実解決TS・acorn等のローカル依存を指定し、旧rootへの解決と版の一致を確認する。候補／既存 `dist`、利用者の設定・資格情報、外部registryに迂回しない。両wrapperは `tmpdir()` の下の固定相対名 `servicenow-mcp-owner-pack-cache` を使うので、承認済みの専用一時領域に分け、候補や別runと同じcacheにならないことを起動前に確認する。
2. **別承認後、旧rootの空buildと元wrapperを固定順で検証する。** 旧版から一回生成した `dist` のmanifestを固定し、PK01の完全な終端後にPK03へ進む。どちらも `npm pack --dry-run --ignore-scripts --offline --json` を元wrapperのまま一回行い、実tarball生成・展開・外部取得を行わない。wrapper直下の静的な子呼出し点は、npm各1のほかfixtureがPK01で4、PK03で25。途中停止で未到達の子は成功にしない。これは**子孫や待時間の上界ではない**。各fixtureの子孫・通信／書込み経路の確認と、外側時間枠・cleanup予約は別に必要。既存の60秒や他scriptのtimeoutを流用しない。
3. **終了と試験結果を分ける。** 前後のpin・全assertionと各子の所定結果に加え、runner・子／worker・stdio・cleanup／保全を別々に確認する。成功ログだけを採用せず、未確認なら次wrapperと再試行は0。旧rootの削除・保全は承認されたownerに限り、応答不明で二重移譲／削除しない。[終了・保全設計](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の考え方を参照するが、候補slotや承認を旧版側に流用しない。

## 4 候補側の判定と、次に必要な承認

[PK01／FX05の試験分離](BEST_PRACTICE_RELEASE_AP05_PK01_FX05_VERIFICATION_SPLIT_DESIGN.md)・[PK03／FX06の試験分離](BEST_PRACTICE_RELEASE_AP05_PK03_FX06_VERIFICATION_SPLIT_DESIGN.md)どおり、候補Pは別の独立検査で通常の会計・release・停止／解放、値kernelの保持、旧専用辺の不在／混入を判定する。Hの成功は**旧保証を開発側で継続検証できること**まで。候補側の旧時刻引渡し・同位置の取消、旧ACK-36 Promise拒否を回復したとはしない。それらの処遇と、同候補で得るED06の代替条件①〜③は別決裁・別結果。

2026-11-20のユーザー指示「承認します」を、推奨した方式の採用と旧PK01の隔離再現の審査準備に記録した。[旧PK01だけの隔離再現・実行前承認票案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_LEGACY_PK01_ISOLATED_REPRO_APPROVAL.md)を追加した。対象と依存の固定、子・stdioの終了確認、外側時間枠とcleanup／保全の値・手段・責務は個別に指定し、別承認までは空buildもdry-runも起動しない。PK03の実行はより広い旧検査を含むため、その根拠を独立に揃える。本MDの更新と承認票案の追加・静的照合のみ。旧試験、正式発行口閉鎖、全体受付無効、外部利用Unknown・閲覧0・調査保留を維持する。候補指定・試験実行・build・梱包・保全操作・実通信・設定変更・コミット・Push・公開は行わない。
