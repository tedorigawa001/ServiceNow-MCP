# BP-5 R-2 OL-03：固定exec・FD／環境制御の合成検証

Date: 2026-10-19 / 内部部品の実装・合成試験。telemetry調査/maint依頼は保留。

## 1. 到達点と実行を許可しない境界

[Rust library](../native/r2-outer/README.md)へ、固定引数parser、専用process用exec部品、
`exec_installed`接続口を追加した。bin/公開CLI/npm/MCP登録や実配備は追加していない。
OL-02検査→runtime trust gate→固定Image構築→execの順に接続するが、**runtime gateは必ず92で停止する現段階の未完了ゲート**である。
署名/entitlementの実照合、closure index全体、group全reader、信頼済み署名配備、exec直前のrecord/期限/identity再検証が未実装だからである。
InspectedRecordsを実行permitへ変換せず、外部callback/argv/env/manifestによるgate解除口を設けない。
従って実運用の固定Node起動が成立した、OL-03全体/実PDI開始条件が完了した、とは報告しない。

OS効果の試験は、test-only sourceからprivate exec部品を直接組み込んだ合成peerをコンパイルして行った。
これは実行権限を持たない通常callerへのAPIではなく、OS境界の試験用ハーネスである。
本番用署名のないfixtureを信頼済みlauncherとして使ってはならない。

## 2. 固定起動契約

| 項目 | 実装/検証 |
|---|---|
| 引数 | 省略modeはcheck-plan。明示check-plan/run＋canonical絶対manifest pathだけ。未知flag、追加引数、任意node/import/digest/--yes、相対/不正pathを拒否 |
| exec | OL-02 ledgerの固定node/cwdからImageを作り、entryはcwd配下のdist/review/r2-launcher-entry.js。shell/PATH探索/spawn/wrapper待機/再試行なし |
| argv | node、固定entry、check-planまたはrun、manifestの4要素。環境からargumentを追加しない |
| env | envpを空で明示。NODE_OPTIONS/NODE_PATH/資格情報/RUST_BACKTRACE/汚染PATHを継承しない。OSが付与する既存CF encoding例外はpeerで形式限定 |
| TTY | stdin/stderrが同じ端末identity、ICANON/ISIG、foreground process group一致、pending inputなし。非TTY/raw/cwd不適合はexec前に拒否 |
| cwd/limits | 固定cwdをopen no-followしてfchdir。umask077、soft/hard RLIMIT_CORE=0、読戻し確認。親/共有processへ適用しない |
| FD | stdoutを/dev/nullへ置換。std FDのCLOEXECを解除。proc_pidinfoのbounded表（最大65,536項目、満杯/不正応答は拒否）からFD>=3を閉じ、0/1/2だけになったことを再確認 |
| signal | 専用childでmaskを空にし、SIGKILL/SIGSTOP以外の全catchable signal（Darwin 1〜31）のdispositionをdefaultへ（§6）。exec後は同PIDのtargetが所有し、外側はsignal転送/終了code変換をしない |
| 失敗 | state変更前の拒否は固定値。部分的にcwd/FD/limitを変えた後は93で専用processを終了し、共有callerへ戻らない。execve失敗は94だけ、raw errno/path/例外を出さない |

外側codeは90=引数拒否、91=record拒否、92=trust gate未完了、93=setup失敗、94=exec失敗、95=exec adapter対象外。
既存entryのcodeと重ねない。unsupported hostのrecord検査拒否は接続口で91へ集約する場合がある。
番号だけからtoken未発行やcleanup完了を推定しない。0や71/73はexec成功後のtargetの終了値であり、外側成功票ではない。

FD列挙・state変更は専用single-threaded processを前提とする。同時にFDを開く他threadやsignal callbackがある共有processへ使わない。
targetの不変path/全祖先・署名・closure/残期限の検証をexec部品が単独で代替する設計ではなく、未完了gateを保持する。

## 3. 合成OS試験

[exec_tests](../native/r2-outer/src/exec_tests.rs)は実PTYと独立childを使う。
childは試験専用のsession/controlling TTYを設定し、fake Nodeの位置へRust peerをexecする。
peerは独立した環境・argv/cwd・core limit・umask・余分なFD・signal maskを検査してから、固定PID/codeだけをTTYへ返す。
親はPIDがexec前のchildと同じこと、exit signal=null、期待code、stdout空、秘密マーカーが端末へ出ないことを確認する。
実Node/V8やServiceNowの認可・token・MCP処理を走らせる試験ではない。

- 0/10/64/70/71/72/73/80/81/82/124/130の12値を変換せず保持。
- driverが意図的に200/201の非CLOEXEC FD、SIGINT/SIGHUP/SIGQUIT/SIGTSTP/SIGUSR1のignore・blocked SIGTERM、汚染envを持たせ、peer側で除去を確認。
- peerのstdoutへの秘密マーカーは破棄され、親stdoutは空。
- 存在しない固定nodeで94、非TTY/raw/cwd欠落で93、argv注入で90。全てpeer成功markerなし・診断非出力。
- 試験用の5秒watchdogで所有childだけをkill/waitする。製品期限は緩めない。
- fixtureの参照をArcで所有し、最後のchild/test利用が終わってから一時binaryを削除する。
  OS効果は一時PTYとowned childのみで、利用者の実端末設定・配備/アカウント/接続設定は変更しない。

### RED・途中の失敗・負の対照

既定check-planを拒否するstubに対してREDを確認し、固定grammarへ変更した。
OS試験初回のcompileはopenptyのnullable引数をconst pointerで渡して失敗し、ローカルlibc宣言のmut pointerへ合わせた。
Clippyのmanual_is_multiple_of指摘も同等の標準methodへ訂正し、lintの抑制で通していない。

別の一時コピーでenvpにPRIVATE_TOKENの合成値を混ぜる負の対照を実施した。
同じOS試験はexpected0に対してpeerの拒否97となり失敗し、環境検査が非空envを検出できることを確認した。
変更は一時コピーだけで、通常実装へ注入用switchや実運用bypassを追加していない。
これはpreloadコード自体やDYLD loaderが実行されないという実験ではなく、exec後の環境非継承と引数拒否の確認である。

## 4. 検証結果

| 検証 | 結果 |
|---|---|
| cargo test --offline --locked（専用manifest） | 30件成功（既存21＋parser2＋接続口3＋実PTY/exec4）。OS試験内で終了code12値等を反復 |
| cargo build --offline --locked --release | 成功。libraryのみで、signed operational launcherではない |
| cargo clippy --offline --locked --all-targets -- -D warnings | 成功 |
| cargo fmt -- --check | 成功（専用manifest） |
| npm run build | 成功 |
| npm test -- --maxWorkers=1 | 121ファイル・3,126件成功、80.40秒。Rustとは別集計 |
| 空envの負の対照 | 合成秘密を混ぜた一時コピーで1件失敗（expected0/actual97）、29件は選択対象外。コピー削除済み |

## 5. 留保・後続

実Nodeとの空env互換（locale/timezone/並び順/JSON再投影）、署名/closure/全group、配備recordの最終revalidation、
panic/bootstrap以前の秘密非出力・loader注入・実機OS/Node下限は未検証。
現行gateを成功化する実装は、これらの不変条件を具体的な証拠に結び付けてから別途行う。
任意のPATH検索やunsigned/別Nodeへのfallback、publicな検証済み自己申告を追加してはならない。
core制限はchild内だけであり、OS/EDR収集やメモリ完全消去・既存token失効を保証しない。
G2/G4・OL-01正式承認・実PDIは未実施のまま。telemetry保留、token発行・実機操作・設定変更・Pushなし。

## 6. レビュー後の修正：継承したSIG_IGNの除去（2026-10-19）

execはhandlerを既定へ戻すが、SIG_IGN（無視）はそのまま引き継ぐ。従来はINT/TERM/CHLD/PIPEだけをdefaultへ戻しており、
例えば`nohup`経由ではSIGHUPが無視されたまま残り、端末が切れてもNodeと認可処理が続き得た。

- probeのdriverでSIGHUP/SIGQUIT/SIGTSTP/SIGUSR1もignoreにし、replacement側で「SIGKILL/SIGSTOP/SIGPIPE以外にSIG_IGNが残っていない」ことを検査する試験へ強化した。
  修正前の実装では`real_exec_preserves_codes_and_enforces_os_contract`がpeerの固定失敗（97）で失敗することを確認した（RED）。
- `exec_os`はSIGKILL/SIGSTOP以外の1〜31をすべてSIG_DFLへ戻すよう修正した（Darwin NSIG=32。libcはmacOS向けに定数を公開しない）。修正後30件成功。
- 試験上の除外：Rust std（Nodeも同様）は起動時に自らSIGPIPEをSIG_IGNへ設定し、SIGSEGV/SIGBUSにも自前handlerを置く。
  そのためpeerはSIG_DFLとの一致ではなくSIG_IGNの不在を検査し、SIGPIPEは観測対象外とした。SIGPIPEのdefault化自体は実装で行う。
- clippy `-D warnings`・`fmt --check`・release buildも成功。
- レビュー時に以前の実行で残った一時directory（10:45作成、合成probe binary 1件のみ）を確認し、削除した。修正後の実行では新たな残存はない。
